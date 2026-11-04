package com.unimarket.service.admin;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.chat.ChatService;
import com.unimarket.service.order.OrderValues;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Violation reports about listings or accounts ({@code dbo.Reports}; Business Plan 6.7: "Users can report suspicious or
 * inappropriate products and accounts. Admins can review reports and remove content or restrict accounts").
 *
 * <p>Reports are NOT order disputes: problems with a paid order use {@code OrderDisputes} (D3). A report targets either
 * a listing or an account (CHECK: exactly one). The schema has a single {@code Reason} text column, so the reason code
 * chosen in the frontend is stored at its start: {@code "OFF_PLATFORM_PAYMENT: details"}.</p>
 *
 * <p>Resolving or dismissing a report records the admin's decision only; blocking a listing or suspending an account
 * are separate, explicit admin actions.</p>
 */
@Service
@Profile("!nodb")
public class ReportService {

    /** Reason codes of the frontend ({@code REPORT_REASONS}). */
    public static final Set<String> REASON_CODES = Set.of("MISLEADING", "PROHIBITED", "OFF_PLATFORM_PAYMENT", "FAKE", "HARASSMENT", "SPAM", "OTHER");
    private static final Logger log = LoggerFactory.getLogger(ReportService.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final AdminSupport support;
    private final ChatService chat;

    public ReportService(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager transactionManager, AdminSupport support, ChatService chat) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.support = support;
        this.chat = chat;
    }

    // ------------------------------------------------------------------ students

    /**
     * Reports a public listing, a student account or a conversation (V004). The reporter comes from the token.
     * A CONVERSATION report can only be made by a participant; it names the other participant as the reported account
     * and lets the admin handling it read that conversation.
     *
     * @param targetType LISTING, USER or CONVERSATION
     * @param reasonCode one of {@link #REASON_CODES}
     * @param details    optional, at most 500 characters
     */
    public AdminDtos.Report create(String targetType, int targetId, String reasonCode, String details, AuthenticatedUser reporter) {
        String type = targetType == null ? "" : targetType.trim().toUpperCase(Locale.ROOT);
        String code = reasonCode == null ? "" : reasonCode.trim().toUpperCase(Locale.ROOT);
        String text = details == null ? "" : details.trim();
        if (!type.equals("LISTING") && !type.equals("USER") && !type.equals("CONVERSATION")) {
            throw invalid("targetType", "must be LISTING, USER or CONVERSATION");
        }
        if (!REASON_CODES.contains(code)) {
            throw invalid("reason", "must be one of " + String.join(", ", REASON_CODES.stream().sorted().toList()));
        }
        if (text.length() > 500) {
            throw invalid("details", "must be at most 500 characters");
        }
        Integer productId = null;
        Integer userId = null;
        Integer conversationId = null;
        if (type.equals("CONVERSATION")) {
            int[] participants = chat.participants(targetId, reporter); // 404 unless the reporter takes part
            Integer messages = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.ConversationMessages WHERE ConversationId = :id AND SenderId <> :me",
                    Map.of("id", targetId, "me", reporter.id()), Integer.class);
            if (messages == null || messages == 0) {
                throw invalid("targetId", "there is no message from the other person to report");
            }
            userId = participants[0] == reporter.id() ? participants[1] : participants[0];
            conversationId = targetId;
        } else if (type.equals("LISTING")) {
            Map<String, Object> listing = jdbc.queryForList("SELECT SellerId FROM dbo.Products WHERE ProductId = :id AND ModerationStatus = 'Approved' "
                    + "AND Status IN ('Available', 'Reserved', 'Sold')", Map.of("id", targetId)).stream().findFirst()
                    .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
            if (((Number) listing.get("SellerId")).intValue() == reporter.id()) {
                throw invalid("targetId", "you cannot report your own listing");
            }
            productId = targetId;
        } else {
            if (targetId == reporter.id()) {
                throw invalid("targetId", "you cannot report yourself");
            }
            Integer found = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE UserId = :id AND Role = 'Student' AND Status <> 'Closed'",
                    Map.of("id", targetId), Integer.class);
            if (found == null || found == 0) {
                throw new ApiException(ErrorCode.NOT_FOUND, "Account not found.");
            }
            userId = targetId;
        }
        MapSqlParameterSource params = new MapSqlParameterSource("reporter", reporter.id()).addValue("product", productId, Types.INTEGER)
                .addValue("user", userId, Types.INTEGER).addValue("conversation", conversationId, Types.INTEGER)
                .addValue("reason", text.isEmpty() ? code : code + ": " + text);
        Long id = transaction.execute(status -> {
            // One unhandled report per reporter and target. Account reports and conversation reports are separate targets.
            Integer open = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM dbo.Reports WITH (UPDLOCK, HOLDLOCK)
                    WHERE ReporterId = :reporter AND Status IN ('Open', 'Reviewing')
                      AND ((:conversation IS NOT NULL AND ConversationId = :conversation)
                        OR (:conversation IS NULL AND :product IS NOT NULL AND ProductId = :product)
                        OR (:conversation IS NULL AND :user IS NOT NULL AND ReportedUserId = :user AND ConversationId IS NULL))""", params, Integer.class);
            if (open != null && open > 0) {
                throw new ApiException(ErrorCode.REPORT_ALREADY_OPEN);
            }
            return jdbc.queryForObject("INSERT dbo.Reports (ReporterId, ProductId, ReportedUserId, ConversationId, Reason) OUTPUT inserted.ReportId "
                    + "VALUES (:reporter, :product, :user, :conversation, :reason)", params, Long.class);
        });
        log.info("Report {} on {} {} by user {}", id, type, targetId, reporter.id());
        return one(id, false);
    }

    /** The signed-in user's own reports, newest first. */
    public List<AdminDtos.Report> mine(AuthenticatedUser reporter) {
        return jdbc.query(REPORT_SQL + " WHERE r.ReporterId = :me ORDER BY r.CreatedAt DESC, r.ReportId DESC", Map.of("me", reporter.id()),
                (rs, i) -> report(rs, false));
    }

    // ------------------------------------------------------------------ admins

    /**
     * @param status     ACTIVE (Open + Reviewing, default), OPEN, REVIEWING, RESOLVED, DISMISSED or ALL
     * @param targetType LISTING, USER or null
     */
    public PageResponse<AdminDtos.Report> list(String status, String targetType, int page, int size) {
        AdminSupport.requirePage(page, size);
        String key = status == null || status.isBlank() ? "ACTIVE" : status.trim().toUpperCase(Locale.ROOT);
        List<String> statuses = switch (key) {
            case "ACTIVE" -> List.of("Open", "Reviewing");
            case "OPEN" -> List.of("Open");
            case "REVIEWING" -> List.of("Reviewing");
            case "RESOLVED" -> List.of("Resolved");
            case "DISMISSED" -> List.of("Dismissed");
            case "ALL" -> List.of("Open", "Reviewing", "Resolved", "Dismissed");
            default -> throw invalid("status", "must be ACTIVE, OPEN, REVIEWING, RESOLVED, DISMISSED or ALL");
        };
        String type = targetType == null || targetType.isBlank() ? null : targetType.trim().toUpperCase(Locale.ROOT);
        if (type != null && !type.equals("LISTING") && !type.equals("USER") && !type.equals("CONVERSATION")) {
            throw invalid("targetType", "must be LISTING, USER or CONVERSATION");
        }
        MapSqlParameterSource params = new MapSqlParameterSource("statuses", statuses).addValue("type", type, Types.VARCHAR)
                .addValue("offset", (page - 1) * size).addValue("limit", size);
        String where = " WHERE r.Status IN (:statuses) AND (:type IS NULL OR (:type = 'LISTING' AND r.ProductId IS NOT NULL)"
                + " OR (:type = 'USER' AND r.ReportedUserId IS NOT NULL AND r.ConversationId IS NULL)"
                + " OR (:type = 'CONVERSATION' AND r.ConversationId IS NOT NULL))";
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Reports r" + where, params, Long.class);
        List<AdminDtos.Report> items = jdbc.query(REPORT_SQL + where + " ORDER BY r.CreatedAt, r.ReportId OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY",
                params, (rs, i) -> report(rs, true));
        long count = total == null ? 0 : total;
        return new PageResponse<>(items, page, size, count, (int) ((count + size - 1) / size), null);
    }

    public AdminDtos.Report detail(long reportId) {
        return one(reportId, true);
    }

    /** Open → Reviewing (an admin is looking at it). */
    public AdminDtos.Report startReview(long reportId, AuthenticatedUser admin) {
        transaction.executeWithoutResult(status -> {
            if (jdbc.update("UPDATE dbo.Reports SET Status = 'Reviewing' WHERE ReportId = :id AND Status = 'Open'", Map.of("id", reportId)) != 1) {
                throw conflictOrNotFound(reportId);
            }
            support.audit(admin.id(), "Review report", "Report", reportId, null);
        });
        return one(reportId, true);
    }

    /** Open / Reviewing → Resolved (action taken) or Dismissed (no violation). Final; a second decision is refused. */
    public AdminDtos.Report decide(long reportId, boolean resolved, String resolution, AuthenticatedUser admin) {
        String text = AdminSupport.requireReason(resolution, "resolution", 2000);
        transaction.executeWithoutResult(status -> {
            int changed = jdbc.update("""
                    UPDATE dbo.Reports SET Status = :status, Resolution = :resolution, ResolvedBy = :admin, ResolvedAt = SYSUTCDATETIME()
                    WHERE ReportId = :id AND Status IN ('Open', 'Reviewing')""",
                    Map.of("id", reportId, "status", resolved ? "Resolved" : "Dismissed", "resolution", text, "admin", admin.id()));
            if (changed != 1) {
                throw conflictOrNotFound(reportId);
            }
            support.audit(admin.id(), resolved ? "Resolve report" : "Dismiss report", "Report", reportId, text);
        });
        log.info("Report {} {} by admin {}", reportId, resolved ? "resolved" : "dismissed", admin.id());
        return one(reportId, true);
    }

    // ------------------------------------------------------------------ helpers

    private AdminDtos.Report one(long reportId, boolean adminView) {
        return jdbc.query(REPORT_SQL + " WHERE r.ReportId = :id", Map.of("id", reportId), (rs, i) -> report(rs, adminView))
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Report not found."));
    }

    private ApiException conflictOrNotFound(long reportId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Reports WHERE ReportId = :id", Map.of("id", reportId), Integer.class);
        return n != null && n > 0 ? new ApiException(ErrorCode.REPORT_STATE_CONFLICT) : new ApiException(ErrorCode.NOT_FOUND, "Report not found.");
    }

    private static ValidationException invalid(String field, String message) {
        return new ValidationException(List.of(new ApiErrorResponse.FieldError(field, message)));
    }

    private static final String REPORT_SQL = """
            SELECT r.ReportId, r.ReporterId, rep.FullName AS ReporterName, r.ProductId, p.Title, p.ModerationStatus, p.SellerId,
                   owner.FullName AS OwnerName, r.ReportedUserId, ru.FullName AS ReportedName, ru.Status AS ReportedStatus,
                   r.Reason, r.Status, r.Resolution, r.CreatedAt, r.ResolvedAt, r.ConversationId, cp.Title AS ConversationTitle
            FROM dbo.Reports r
            JOIN dbo.Users rep ON rep.UserId = r.ReporterId
            LEFT JOIN dbo.Products p ON p.ProductId = r.ProductId
            LEFT JOIN dbo.Users owner ON owner.UserId = p.SellerId
            LEFT JOIN dbo.Users ru ON ru.UserId = r.ReportedUserId
            LEFT JOIN dbo.Conversations conv ON conv.ConversationId = r.ConversationId
            LEFT JOIN dbo.Products cp ON cp.ProductId = conv.ProductId
            """;

    private static AdminDtos.Report report(ResultSet rs, boolean adminView) throws SQLException {
        boolean listing = rs.getObject("ProductId") != null;
        boolean conversation = rs.getObject("ConversationId") != null;
        // CONVERSATION: label = the listing the chat is about; owner / status = the reported participant (admins only).
        AdminDtos.Target target = conversation
                ? new AdminDtos.Target("CONVERSATION", rs.getInt("ConversationId"), rs.getString("ConversationTitle"),
                        adminView ? OrderValues.upper(rs.getString("ReportedStatus")) : null,
                        adminView ? new AdminDtos.Ref(rs.getInt("ReportedUserId"), rs.getString("ReportedName")) : null)
                : listing
                ? new AdminDtos.Target("LISTING", rs.getInt("ProductId"), rs.getString("Title"),
                        adminView ? ModerationService.moderationApi(rs.getString("ModerationStatus")) : null,
                        adminView ? new AdminDtos.Ref(rs.getInt("SellerId"), rs.getString("OwnerName")) : null)
                : new AdminDtos.Target("USER", rs.getInt("ReportedUserId"), rs.getString("ReportedName"),
                        adminView ? OrderValues.upper(rs.getString("ReportedStatus")) : null, null);
        String[] reason = parseReason(rs.getString("Reason"));
        return new AdminDtos.Report(rs.getLong("ReportId"), "RP-" + rs.getLong("ReportId"), target.type(), target,
                adminView ? new AdminDtos.Ref(rs.getInt("ReporterId"), rs.getString("ReporterName")) : null, reason[0],
                reason[1], OrderValues.upper(rs.getString("Status")), rs.getString("Resolution"),
                ModerationService.utc(rs, "CreatedAt"), ModerationService.utc(rs, "ResolvedAt"));
    }

    /**
     * Splits a stored {@code Reports.Reason} into {@code [code, details]}. Written as {@code "CODE"} or
     * {@code "CODE: details"}; only the text before the FIRST colon is a code candidate, so colons inside the
     * details are kept. Older rows without a known code (e.g. demo data) become {@code OTHER} with the whole text.
     *
     * @return the reason code (never null) and the details (null when empty)
     */
    public static String[] parseReason(String stored) {
        String reason = stored == null ? "" : stored.trim();
        int colon = reason.indexOf(':');
        String prefix = colon > 0 ? reason.substring(0, colon) : reason;
        if (REASON_CODES.contains(prefix)) {
            String details = colon > 0 ? reason.substring(colon + 1).trim() : "";
            return new String[]{prefix, details.isEmpty() ? null : details};
        }
        return new String[]{"OTHER", reason.isEmpty() ? null : reason};
    }
}
