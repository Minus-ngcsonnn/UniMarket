package com.unimarket.service.admin;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.product.ProductSpecifications;
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

/**
 * Admin account management (Business Plan 6.3 "Administration", 6.5, 6.7): list, inspect, suspend, reactivate.
 *
 * <ul>
 *   <li>Only Student accounts can be suspended; an admin cannot suspend an admin (or themselves). There is no endpoint
 *       that changes a role.</li>
 *   <li>Suspension takes effect on the next request: every token is checked against {@code Users.Status}
 *       (Stage 2), so a suspended account gets 401. Its listings leave the catalog (seller must be active) and it cannot
 *       check out; existing orders, payments, settlements and reviews are kept unchanged.</li>
 *   <li>Student verification approval is not offered: the policy is a pending team decision. {@code emailVerified}
 *       only means the email was confirmed.</li>
 * </ul>
 */
@Service
@Profile("!nodb")
public class AdminUserService {

    static final String SUSPEND = "Suspend account";
    static final String REACTIVATE = "Reactivate account";
    static final String VIEW_CONTACT = "View private contact";
    private static final Logger log = LoggerFactory.getLogger(AdminUserService.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final AdminSupport support;

    public AdminUserService(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager transactionManager, AdminSupport support) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.support = support;
    }

    /**
     * @param q      text in the name or email
     * @param status ACTIVE, SUSPENDED, CLOSED or null for all
     * @param role   STUDENT (default), ADMIN or ALL
     */
    public PageResponse<AdminDtos.User> list(String q, String status, String role, int page, int size) {
        AdminSupport.requirePage(page, size);
        String statusSql = status == null || status.isBlank() ? null : switch (status.trim().toUpperCase(Locale.ROOT)) {
            case "ACTIVE" -> "Active";
            case "SUSPENDED" -> "Suspended";
            case "CLOSED" -> "Closed";
            default -> throw new ValidationException(List.of(new ApiErrorResponse.FieldError("status", "must be ACTIVE, SUSPENDED or CLOSED")));
        };
        String roleKey = role == null || role.isBlank() ? "STUDENT" : role.trim().toUpperCase(Locale.ROOT);
        String roleSql = switch (roleKey) {
            case "STUDENT" -> "Student";
            case "ADMIN" -> "Admin";
            case "ALL" -> null;
            default -> throw new ValidationException(List.of(new ApiErrorResponse.FieldError("role", "must be STUDENT, ADMIN or ALL")));
        };
        MapSqlParameterSource params = new MapSqlParameterSource("offset", (page - 1) * size).addValue("limit", size)
                .addValue("status", statusSql, Types.VARCHAR).addValue("role", roleSql, Types.VARCHAR)
                .addValue("q", ProductSpecifications.likePattern(q), Types.NVARCHAR);
        String where = " WHERE (:status IS NULL OR u.Status = :status) AND (:role IS NULL OR u.Role = :role)"
                + " AND (:q IS NULL OR u.FullName LIKE :q ESCAPE '\\' OR u.Email LIKE :q ESCAPE '\\')";
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users u" + where, params, Long.class);
        List<AdminDtos.User> items = jdbc.query(USER_SQL + where + " ORDER BY u.CreatedAt DESC, u.UserId DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY",
                params, (rs, i) -> user(rs, false, null));
        long count = total == null ? 0 : total;
        return new PageResponse<>(items, page, size, count, (int) ((count + size - 1) / size), null);
    }

    /** Safe details: activity counts, rating, open reports, contact details and the admin action history. */
    public AdminDtos.User detail(int userId) {
        List<AdminDtos.ModerationEvent> history = jdbc.query("""
                SELECT a.Action, a.Reason, a.CreatedAt, a.AdminId, u.FullName FROM dbo.AdminActions a JOIN dbo.Users u ON u.UserId = a.AdminId
                WHERE a.EntityType = 'User' AND a.EntityId = :id ORDER BY a.CreatedAt, a.ActionId""", Map.of("id", userId),
                (rs, i) -> new AdminDtos.ModerationEvent(rs.getString("Action").equals(SUSPEND) ? "SUSPENDED"
                        : rs.getString("Action").equals(REACTIVATE) ? "REACTIVATED"
                        : rs.getString("Action").equals(VIEW_CONTACT) ? "PRIVATE_CONTACT_VIEWED" : rs.getString("Action"), rs.getString("Reason"),
                        new AdminDtos.Ref(rs.getInt("AdminId"), rs.getString("FullName")), ModerationService.utc(rs, "CreatedAt")));
        return jdbc.query(USER_SQL + " WHERE u.UserId = :id", Map.of("id", userId), (rs, i) -> user(rs, true, history))
                .stream().findFirst().orElseThrow(AdminUserService::notFound);
    }

    /**
     * Private contact details (phone / Zalo) of an account, for support, moderation or dispute handling. Admins only
     * ({@code /api/admin/**}); a purpose is required and EVERY access is recorded in {@code AdminActions}
     * ("View private contact"), so reads of private data are auditable. The public sharing rule (ShowContact) is not
     * changed: this only concerns admins.
     */
    public ContactAccess privateContact(int userId, String purpose, AuthenticatedUser admin) {
        String why = AdminSupport.requireReason(purpose, "purpose", 1000);
        return transaction.execute(status -> {
            ContactAccess contact = jdbc.query("SELECT Phone, ZaloUrl, ShowContact FROM dbo.Users WHERE UserId = :id", Map.of("id", userId),
                    (rs, i) -> new ContactAccess(userId, rs.getString("Phone"), rs.getString("ZaloUrl"), rs.getBoolean("ShowContact")))
                    .stream().findFirst().orElseThrow(AdminUserService::notFound);
            support.audit(admin.id(), VIEW_CONTACT, "User", userId, why);
            log.info("Admin {} viewed the private contact of account {} (audited)", admin.id(), userId);
            return contact;
        });
    }

    /** @param showContact whether the user shares these details publicly */
    public record ContactAccess(int userId, String phone, String zaloUrl, boolean showContact) {
    }

    /** Active student → Suspended (reason required, recorded in AdminActions). */
    public AdminDtos.User suspend(int userId, String reason, AuthenticatedUser admin) {
        String why = AdminSupport.requireReason(reason, "reason", 1000);
        if (admin.id() == userId) {
            throw new ApiException(ErrorCode.ACCOUNT_STATE_CONFLICT, "You cannot suspend your own account.");
        }
        change(userId, "Suspended", "Active", SUSPEND, why, admin, "Only an active student account can be suspended.");
        log.info("Account {} suspended by admin {}", userId, admin.id());
        return detail(userId);
    }

    /** Suspended student → Active. */
    public AdminDtos.User reactivate(int userId, String note, AuthenticatedUser admin) {
        change(userId, "Active", "Suspended", REACTIVATE, note == null || note.isBlank() ? null : note.trim(), admin,
                "Only a suspended student account can be reactivated.");
        log.info("Account {} reactivated by admin {}", userId, admin.id());
        return detail(userId);
    }

    private void change(int userId, String to, String from, String action, String reason, AuthenticatedUser admin, String conflict) {
        transaction.executeWithoutResult(status -> {
            int changed = jdbc.update("UPDATE dbo.Users SET Status = :to, UpdatedAt = SYSUTCDATETIME() "
                    + "WHERE UserId = :id AND Role = 'Student' AND Status = :from", Map.of("id", userId, "to", to, "from", from));
            if (changed != 1) {
                Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE UserId = :id", Map.of("id", userId), Integer.class);
                throw exists != null && exists > 0 ? new ApiException(ErrorCode.ACCOUNT_STATE_CONFLICT, conflict) : notFound();
            }
            support.audit(admin.id(), action, "User", userId, reason);
        });
    }

    private static final String USER_SQL = """
            SELECT u.UserId, u.Email, u.FullName, u.Role, u.Status, u.EmailVerifiedAt, u.CreatedAt, u.Phone, u.ZaloUrl, u.ShowContact,
                   c.CampusId, c.Name AS CampusName, u.DeclaredUniversityName, r.AverageRating, COALESCE(r.ReviewCount, 0) AS ReviewCount,
                   (SELECT COUNT(*) FROM dbo.Products p WHERE p.SellerId = u.UserId AND p.Status <> 'Removed') AS ListingCount,
                   (SELECT COUNT(*) FROM dbo.Orders o WHERE o.BuyerId = u.UserId) AS OrdersAsBuyer,
                   (SELECT COUNT(*) FROM dbo.Orders o WHERE o.SellerId = u.UserId) AS OrdersAsSeller,
                   (SELECT COUNT(*) FROM dbo.Reports rp WHERE rp.ReportedUserId = u.UserId AND rp.Status IN ('Open', 'Reviewing')) AS OpenReports
            FROM dbo.Users u
            LEFT JOIN dbo.Campuses c ON c.CampusId = u.CampusId
            LEFT JOIN dbo.vw_UserRatings r ON r.UserId = u.UserId
            """;

    private static AdminDtos.User user(ResultSet rs, boolean detail, List<AdminDtos.ModerationEvent> history) throws SQLException {
        return new AdminDtos.User(rs.getInt("UserId"), rs.getString("Email"), rs.getString("FullName"), OrderValues.upper(rs.getString("Role")),
                OrderValues.upper(rs.getString("Status")), rs.getObject("EmailVerifiedAt") != null,
                rs.getObject("CampusId") == null ? null : new AdminDtos.Ref(rs.getInt("CampusId"), rs.getString("CampusName")),
                rs.getString("DeclaredUniversityName"), ModerationService.utc(rs, "CreatedAt"),
                rs.getInt("ListingCount"), rs.getInt("OrdersAsBuyer"), rs.getInt("OrdersAsSeller"), rs.getBigDecimal("AverageRating"),
                rs.getInt("ReviewCount"), rs.getInt("OpenReports"),
                // Contact only when the user shares it publicly; private contact needs the audited contact-access call.
                detail && rs.getBoolean("ShowContact") ? rs.getString("Phone") : null,
                detail && rs.getBoolean("ShowContact") ? rs.getString("ZaloUrl") : null, detail ? rs.getBoolean("ShowContact") : null,
                history);
    }

    static ApiException notFound() {
        return new ApiException(ErrorCode.NOT_FOUND, "Account not found.");
    }
}
