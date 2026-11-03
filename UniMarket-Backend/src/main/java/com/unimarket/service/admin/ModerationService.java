package com.unimarket.service.admin;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.product.ProductMapper;
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
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Admin moderation of listings (pre-moderation, decision of 2026-11-01; Business Plan 3.2, 6.3 "Administration", 6.5).
 *
 * <ul>
 *   <li>Only {@code Products.ModerationStatus} changes (Pending / Approved / Rejected); the sale status is separate.
 *       Approving never makes a Reserved, Sold, Removed or Draft listing purchasable: buying still needs Available.</li>
 *   <li>Approve and reject need the {@code Products.Version} (rowversion) the admin reviewed. The update only applies
 *       when the row still has that version, so a seller edit in between (which also returns the listing to Pending)
 *       makes the action fail with 409 LISTING_CHANGED instead of approving content the admin never saw.</li>
 *   <li>Every action is one conditional UPDATE plus an {@code AdminActions} row in the same transaction.</li>
 * </ul>
 * There is no moderation procedure in V002; this uses only existing columns and the existing audit table.
 */
@Service
@Profile("!nodb")
public class ModerationService {

    static final String APPROVE = "Approve listing";
    static final String REJECT = "Reject listing";
    static final String BLOCK = "Block listing";
    static final String REMOVE = "Remove listing";
    private static final Map<String, String> EVENT = Map.of(APPROVE, "APPROVED", REJECT, "REJECTED", BLOCK, "BLOCKED", REMOVE, "REMOVED");
    private static final Map<String, String> MODERATION_SQL = Map.of("PENDING", "Pending", "APPROVED", "Approved", "BLOCKED", "Rejected");
    private static final Logger log = LoggerFactory.getLogger(ModerationService.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final AdminSupport support;

    public ModerationService(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager transactionManager, AdminSupport support) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.support = support;
    }

    // ------------------------------------------------------------------ reading

    /**
     * Moderation queue, oldest first for PENDING (first come, first reviewed), newest first otherwise.
     *
     * @param moderation PENDING (default), APPROVED, BLOCKED or ALL
     * @param q          optional text in the title or seller name
     */
    public PageResponse<AdminDtos.Listing> list(String moderation, String q, int page, int size) {
        AdminSupport.requirePage(page, size);
        String key = moderation == null || moderation.isBlank() ? "PENDING" : moderation.trim().toUpperCase(java.util.Locale.ROOT);
        if (!key.equals("ALL") && !MODERATION_SQL.containsKey(key)) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("moderation", "must be PENDING, APPROVED, BLOCKED or ALL")));
        }
        MapSqlParameterSource params = new MapSqlParameterSource("offset", (page - 1) * size).addValue("limit", size)
                .addValue("moderation", MODERATION_SQL.getOrDefault(key, "-"))
                .addValue("q", com.unimarket.service.product.ProductSpecifications.likePattern(q), java.sql.Types.NVARCHAR);
        String where = " WHERE (:moderation = '-' OR p.ModerationStatus = :moderation)"
                + " AND (:q IS NULL OR p.Title LIKE :q ESCAPE '\\' OR s.FullName LIKE :q ESCAPE '\\')";
        String order = key.equals("PENDING") ? " ORDER BY p.UpdatedAt, p.ProductId" : " ORDER BY p.UpdatedAt DESC, p.ProductId DESC";
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Products p JOIN dbo.Users s ON s.UserId = p.SellerId" + where, params, Long.class);
        List<AdminDtos.Listing> items = jdbc.query(LISTING_SQL + where + order + " OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY",
                params, (rs, i) -> listing(rs, null, null, null));
        long count = total == null ? 0 : total;
        return new PageResponse<>(items, page, size, count, (int) ((count + size - 1) / size), null);
    }

    /** Counts per moderation status (queue badges). */
    public Map<String, Long> counts() {
        return jdbc.queryForObject("""
                SELECT SUM(CASE WHEN ModerationStatus = 'Pending' THEN 1 ELSE 0 END) AS pending,
                       SUM(CASE WHEN ModerationStatus = 'Approved' THEN 1 ELSE 0 END) AS approved,
                       SUM(CASE WHEN ModerationStatus = 'Rejected' THEN 1 ELSE 0 END) AS blocked
                FROM dbo.Products""", Map.of(), (rs, i) -> Map.of("PENDING", rs.getLong("pending"), "APPROVED", rs.getLong("approved"),
                "BLOCKED", rs.getLong("blocked")));
    }

    /** Everything an admin needs to decide: content, photos, version, open reports, moderation history. */
    public AdminDtos.Listing detail(int productId) {
        List<String> images = jdbc.queryForList("SELECT ImageUrl FROM dbo.ProductImages WHERE ProductId = :id ORDER BY SortOrder, ImageId",
                Map.of("id", productId), String.class).stream().map(ProductMapper::publicUrl).toList();
        List<AdminDtos.ModerationEvent> history = history(productId, true);
        return jdbc.query(LISTING_SQL + " WHERE p.ProductId = :id", Map.of("id", productId),
                        (rs, i) -> listing(rs, rs.getString("Description"), images, history))
                .stream().findFirst().orElseThrow(ModerationService::notFound);
    }

    /** Moderation events of a listing for its seller (no admin identity). 404 for anyone else. */
    public List<AdminDtos.ModerationEvent> historyForSeller(int productId, AuthenticatedUser seller) {
        Integer owner = jdbc.query("SELECT SellerId FROM dbo.Products WHERE ProductId = :id", Map.of("id", productId),
                (rs, i) -> rs.getInt("SellerId")).stream().findFirst().orElseThrow(ModerationService::notFound);
        if (!owner.equals(seller.id())) {
            throw notFound();
        }
        return history(productId, false);
    }

    private List<AdminDtos.ModerationEvent> history(int productId, boolean withAdmin) {
        return jdbc.query("""
                SELECT a.Action, a.Reason, a.CreatedAt, a.AdminId, u.FullName
                FROM dbo.AdminActions a JOIN dbo.Users u ON u.UserId = a.AdminId
                WHERE a.EntityType = 'Product' AND a.EntityId = :id ORDER BY a.CreatedAt, a.ActionId""", Map.of("id", productId),
                (rs, i) -> new AdminDtos.ModerationEvent(EVENT.getOrDefault(rs.getString("Action"), rs.getString("Action")), rs.getString("Reason"),
                        withAdmin ? new AdminDtos.Ref(rs.getInt("AdminId"), rs.getString("FullName")) : null, utc(rs, "CreatedAt")));
    }

    // ------------------------------------------------------------------ actions

    /** Pending → Approved, only for the reviewed version. The listing becomes public if (and only if) it is Available. */
    public AdminDtos.Listing approve(int productId, String version, String note, AuthenticatedUser admin) {
        byte[] reviewed = parseVersion(version);
        transaction.executeWithoutResult(status -> {
            int changed = jdbc.update("""
                    UPDATE dbo.Products SET ModerationStatus = 'Approved', UpdatedAt = SYSUTCDATETIME()
                    WHERE ProductId = :id AND ModerationStatus = 'Pending' AND Status IN ('Draft', 'Available') AND Version = :version""",
                    new MapSqlParameterSource("id", productId).addValue("version", reviewed));
            if (changed != 1) {
                throw whyNot(productId, reviewed, "Only a pending listing that is not removed can be approved.");
            }
            support.audit(admin.id(), APPROVE, "Product", productId, note == null || note.isBlank() ? null : note.trim());
        });
        log.info("Listing {} approved by admin {}", productId, admin.id());
        return detail(productId);
    }

    /** Pending → Rejected (BLOCKED for the frontend), only for the reviewed version; the reason is shown to the seller. */
    public AdminDtos.Listing reject(int productId, String version, String reason, AuthenticatedUser admin) {
        byte[] reviewed = parseVersion(version);
        String why = AdminSupport.requireReason(reason, "reason", 1000);
        transaction.executeWithoutResult(status -> {
            int changed = jdbc.update("""
                    UPDATE dbo.Products SET ModerationStatus = 'Rejected', UpdatedAt = SYSUTCDATETIME()
                    WHERE ProductId = :id AND ModerationStatus = 'Pending' AND Version = :version""",
                    new MapSqlParameterSource("id", productId).addValue("version", reviewed));
            if (changed != 1) {
                throw whyNot(productId, reviewed, "Only a pending listing can be rejected.");
            }
            support.audit(admin.id(), REJECT, "Product", productId, why);
        });
        log.info("Listing {} rejected by admin {}", productId, admin.id());
        return detail(productId);
    }

    /**
     * Approved → Rejected: hides a public listing that breaks the rules. Its sale status is unchanged; an order that
     * already contains it continues normally (the listing is no longer shown or sold to anyone else).
     */
    public AdminDtos.Listing block(int productId, String reason, AuthenticatedUser admin) {
        String why = AdminSupport.requireReason(reason, "reason", 1000);
        transaction.executeWithoutResult(status -> {
            int changed = jdbc.update("UPDATE dbo.Products SET ModerationStatus = 'Rejected', UpdatedAt = SYSUTCDATETIME() "
                    + "WHERE ProductId = :id AND ModerationStatus = 'Approved'", Map.of("id", productId));
            if (changed != 1) {
                throw exists(productId) ? new ApiException(ErrorCode.MODERATION_CONFLICT, "Only an approved listing can be blocked.") : notFound();
            }
            support.audit(admin.id(), BLOCK, "Product", productId, why);
        });
        log.info("Listing {} blocked by admin {}", productId, admin.id());
        return detail(productId);
    }

    /**
     * Soft-removes a Draft or Available listing (Status = Removed). Reserved and Sold listings belong to an order and
     * cannot be removed (the row and its history are always kept).
     */
    public AdminDtos.Listing remove(int productId, String reason, AuthenticatedUser admin) {
        String why = AdminSupport.requireReason(reason, "reason", 1000);
        transaction.executeWithoutResult(status -> {
            int changed = jdbc.update("""
                    UPDATE dbo.Products SET Status = 'Removed', UpdatedAt = SYSUTCDATETIME()
                    WHERE ProductId = :id AND Status IN ('Draft', 'Available')
                      AND NOT EXISTS (SELECT 1 FROM dbo.vw_ActiveOrderItems a WHERE a.ProductId = :id)""", Map.of("id", productId));
            if (changed != 1) {
                throw exists(productId) ? new ApiException(ErrorCode.MODERATION_CONFLICT,
                        "A reserved, sold or already removed listing cannot be removed.") : notFound();
            }
            support.audit(admin.id(), REMOVE, "Product", productId, why);
        });
        log.info("Listing {} removed by admin {}", productId, admin.id());
        return detail(productId);
    }

    // ------------------------------------------------------------------ helpers

    private ApiException whyNot(int productId, byte[] reviewed, String stateMessage) {
        Optional<byte[]> current = jdbc.query("SELECT Version FROM dbo.Products WHERE ProductId = :id", Map.of("id", productId),
                (rs, i) -> rs.getBytes("Version")).stream().findFirst();
        if (current.isEmpty()) {
            return notFound();
        }
        return Arrays.equals(current.get(), reviewed) ? new ApiException(ErrorCode.MODERATION_CONFLICT, stateMessage)
                : new ApiException(ErrorCode.LISTING_CHANGED);
    }

    private boolean exists(int productId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Products WHERE ProductId = :id", Map.of("id", productId), Integer.class);
        return n != null && n > 0;
    }

    static byte[] parseVersion(String version) {
        String hex = version == null ? "" : version.trim().replaceFirst("^0[xX]", "");
        try {
            byte[] bytes = HexFormat.of().parseHex(hex);
            if (bytes.length == 8) {
                return bytes;
            }
        } catch (IllegalArgumentException ignored) {
            // reported below
        }
        throw new ValidationException(List.of(new ApiErrorResponse.FieldError("version", "must be the listing version (16 hex digits)")));
    }

    static String versionOf(byte[] version) {
        return version == null ? null : HexFormat.of().formatHex(version);
    }

    private static final String LISTING_SQL = """
            SELECT p.ProductId, p.Title, p.Price, p.Condition, p.Status, p.ModerationStatus, p.Version, p.Description,
                   p.CreatedAt, p.UpdatedAt, c.CategoryId, c.Name AS CategoryName, s.UserId AS SellerId, s.FullName AS SellerName,
                   s.Status AS SellerStatus, img.ImageUrl,
                   (SELECT COUNT(*) FROM dbo.Reports r WHERE r.ProductId = p.ProductId AND r.Status IN ('Open', 'Reviewing')) AS OpenReports
            FROM dbo.Products p
            JOIN dbo.Users s ON s.UserId = p.SellerId
            JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
            OUTER APPLY (SELECT TOP (1) i.ImageUrl FROM dbo.ProductImages i WHERE i.ProductId = p.ProductId ORDER BY i.SortOrder, i.ImageId) img
            """;

    private static AdminDtos.Listing listing(ResultSet rs, String description, List<String> images, List<AdminDtos.ModerationEvent> history)
            throws SQLException {
        return new AdminDtos.Listing(rs.getInt("ProductId"), rs.getString("Title"), rs.getBigDecimal("Price").longValueExact(),
                rs.getString("Condition").replace(' ', '_').toUpperCase(java.util.Locale.ROOT), OrderValues.upper(rs.getString("Status")),
                moderationApi(rs.getString("ModerationStatus")), versionOf(rs.getBytes("Version")),
                new AdminDtos.Ref(rs.getInt("CategoryId"), rs.getString("CategoryName")),
                new AdminDtos.Ref(rs.getInt("SellerId"), rs.getString("SellerName")), OrderValues.upper(rs.getString("SellerStatus")),
                ProductMapper.publicUrl(rs.getString("ImageUrl")), utc(rs, "CreatedAt"), utc(rs, "UpdatedAt"), rs.getInt("OpenReports"),
                description, images, history);
    }

    /** Pending → PENDING, Approved → APPROVED, Rejected → BLOCKED (frontend term, Stage 3 mapping). */
    static String moderationApi(String sql) {
        return switch (sql) {
            case "Pending" -> "PENDING";
            case "Approved" -> "APPROVED";
            default -> "BLOCKED";
        };
    }

    static Instant utc(ResultSet rs, String column) throws SQLException {
        LocalDateTime value = rs.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    static ApiException notFound() {
        return new ApiException(ErrorCode.NOT_FOUND, "Listing not found.");
    }
}
