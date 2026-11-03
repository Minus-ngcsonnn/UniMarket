package com.unimarket.service.promotion;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.PaymentResponses;
import com.unimarket.dto.promotion.PromotionDtos;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.order.PaymentResultService;
import com.unimarket.service.order.SqlErrors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Optional paid promotions ("24-hour boost", "Featured 3 days", "Featured 7 days"; Business Plan 4.1.2, 4.2).
 *
 * <ul>
 *   <li>Packages, prices and durations come from {@code PromotionPackages}; the amount stored is the package price.</li>
 *   <li>Only the seller of an Available, approved listing can buy one. One promotion at a time per listing: none while
 *       another is pending payment or still active (the schema has no overlap constraint; this is the conservative
 *       rule).</li>
 *   <li>A promotion becomes Paid (and the listing featured) only through an AUTHENTICATED provider notification
 *       ({@link #recordPayment}); its window starts then. Promotion payments use {@code ProductPromotions}' own
 *       columns, never the merchandise {@code Payments} / order procedures.</li>
 *   <li>Featured = Paid and now within [StartsAt, EndsAt) (Stage 3 catalog rule). Expiry needs no job: the window ends.</li>
 * </ul>
 * MVP: no real provider; every promotion payment is a sandbox simulation ({@code IsSandbox = 1}).
 */
@Service
@Profile("!nodb")
public class PromotionService {

    private static final Logger log = LoggerFactory.getLogger(PromotionService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final boolean simulatorEnabled;

    public PromotionService(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                            @Value("${unimarket.payment.simulator.enabled}") boolean simulatorEnabled) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.simulatorEnabled = simulatorEnabled;
    }

    /** All packages, cheapest first. */
    public List<PromotionDtos.PromotionPackage> packages() {
        return jdbc.query("SELECT PackageId, Name, DurationHours, Price FROM dbo.PromotionPackages ORDER BY Price, PackageId", Map.of(),
                (rs, i) -> new PromotionDtos.PromotionPackage(rs.getInt("PackageId"), rs.getString("Name"), rs.getInt("DurationHours"),
                        rs.getBigDecimal("Price").longValueExact()));
    }

    /**
     * Starts the purchase of a package for the seller's own listing, or returns the pending one ({@code resumed}).
     * Does not make the listing featured: only a verified payment does.
     */
    public PromotionDtos.Promotion start(int productId, int packageId, String providerApi, AuthenticatedUser seller) {
        String provider = OrderValues.providerSql(providerApi).orElseThrow(() -> new ValidationException(List.of(
                new ApiErrorResponse.FieldError("provider", "must be MOMO, ZALOPAY or BANK_QR"))));
        PromotionDtos.PromotionPackage pkg = packages().stream().filter(p -> p.id() == packageId).findFirst()
                .orElseThrow(() -> new ValidationException(List.of(new ApiErrorResponse.FieldError("packageId", "unknown package"))));
        Long promotionId = transaction.execute(status -> {
            Map<String, Object> listing = jdbc.queryForList("""
                    SELECT p.SellerId, p.Status, p.ModerationStatus, s.Status AS SellerStatus, c.IsActive
                    FROM dbo.Products p WITH (UPDLOCK, HOLDLOCK)
                    JOIN dbo.Users s ON s.UserId = p.SellerId JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
                    WHERE p.ProductId = :id""", Map.of("id", productId)).stream().findFirst()
                    .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
            if (((Number) listing.get("SellerId")).intValue() != seller.id()) {
                throw new ApiException(ErrorCode.NOT_FOUND, "Listing not found.");
            }
            Optional<Long> pending = jdbc.queryForList("SELECT PromotionId FROM dbo.ProductPromotions WHERE ProductId = :id AND Status = 'Pending'",
                    Map.of("id", productId), Long.class).stream().findFirst();
            if (pending.isPresent()) {
                return -pending.get();      // negative = resumed
            }
            if (!"Available".equals(listing.get("Status")) || !"Approved".equals(listing.get("ModerationStatus"))
                    || !"Active".equals(listing.get("SellerStatus")) || !Boolean.TRUE.equals(listing.get("IsActive"))) {
                throw new ApiException(ErrorCode.PROMOTION_NOT_ALLOWED, "Only an approved, available listing can be promoted.");
            }
            List<LocalDateTime> activeUntil = jdbc.queryForList("SELECT EndsAt FROM dbo.ProductPromotions WHERE ProductId = :id AND Status = 'Paid' "
                    + "AND EndsAt > SYSUTCDATETIME()", Map.of("id", productId), LocalDateTime.class);
            if (!activeUntil.isEmpty()) {
                throw new ApiException(ErrorCode.PROMOTION_NOT_ALLOWED, "This listing is already promoted until "
                        + activeUntil.stream().max(LocalDateTime::compareTo).orElseThrow().toInstant(ZoneOffset.UTC) + ".");
            }
            return jdbc.queryForObject("""
                    INSERT dbo.ProductPromotions (ProductId, PackageId, Amount, Provider, RequestKey, IsSandbox)
                    OUTPUT inserted.PromotionId VALUES (:product, :package, :amount, :provider, :key, 1)""",
                    new MapSqlParameterSource("product", productId).addValue("package", pkg.id()).addValue("amount", pkg.price())
                            .addValue("provider", provider).addValue("key", "UMP-" + HexFormat.of().formatHex(randomBytes())), Long.class);
        });
        boolean resumed = promotionId != null && promotionId < 0;
        long id = Math.abs(promotionId == null ? 0 : promotionId);
        if (!resumed) {
            log.info("Promotion {} ({}) started for listing {} by seller {} (sandbox)", id, pkg.name(), productId, seller.id());
        }
        return one(id, resumed);
    }

    /** Promotions of the seller's own listing (404 for others), newest first. */
    public List<PromotionDtos.Promotion> ofListing(int productId, AuthenticatedUser seller) {
        Integer owner = jdbc.queryForList("SELECT SellerId FROM dbo.Products WHERE ProductId = :id", Map.of("id", productId), Integer.class)
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
        if (!owner.equals(seller.id())) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Listing not found.");
        }
        return jdbc.query(PROMOTION_SQL + " WHERE pp.ProductId = :id ORDER BY pp.PromotionId DESC", Map.of("id", productId),
                (rs, i) -> promotion(rs, null));
    }

    /** All promotions of the seller's listings, newest first. */
    public List<PromotionDtos.Promotion> mine(AuthenticatedUser seller) {
        return jdbc.query(PROMOTION_SQL + " WHERE p.SellerId = :me ORDER BY pp.PromotionId DESC", Map.of("me", seller.id()),
                (rs, i) -> promotion(rs, null));
    }

    /** @return the promotion with this request key, if it is one (used to route provider notifications) */
    public Optional<Long> idForRequestKey(String requestKey) {
        return jdbc.queryForList("SELECT PromotionId FROM dbo.ProductPromotions WHERE RequestKey = :key", Map.of("key", requestKey == null ? "" : requestKey),
                Long.class).stream().findFirst();
    }

    /** For the simulator: owner, sandbox flag and status of a promotion. */
    public PromotionDtos.Promotion forSeller(long promotionId, AuthenticatedUser seller) {
        PromotionDtos.Promotion promotion = one(promotionId, null);
        Integer owner = jdbc.queryForObject("SELECT SellerId FROM dbo.Products WHERE ProductId = :id", Map.of("id", promotion.productId()), Integer.class);
        if (owner == null || owner != seller.id().intValue()) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Promotion not found.");
        }
        return promotion;
    }

    /** Internal: request key of a promotion (never sent to browsers). */
    public String requestKeyOf(long promotionId) {
        return jdbc.queryForObject("SELECT RequestKey FROM dbo.ProductPromotions WHERE PromotionId = :id", Map.of("id", promotionId), String.class);
    }

    /**
     * Records an AUTHENTICATED provider result for a promotion payment. Checks attempt, provider, amount (= stored
     * package price), reference; identical repeats are ignored, conflicting ones refused. A success activates the
     * promotion from now (or, if another promotion of the listing is still active, from its end) for the package's
     * duration.
     *
     * @param sandboxOnly true for the simulator: it may only settle sandbox promotions
     */
    public PaymentResponses.CallbackResult recordPayment(PaymentResultService.PaymentNotification n, boolean sandboxOnly) {
        String provider = OrderValues.providerSql(n.provider()).orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_MISMATCH, "Unknown payment provider."));
        if (n.providerReference() == null || n.providerReference().isBlank() || n.providerReference().length() > 150) {
            throw new ApiException(ErrorCode.PAYMENT_MISMATCH, "A provider reference is required.");
        }
        String outcome;
        try {
            outcome = transaction.execute(status -> {
                Map<String, Object> row = jdbc.queryForList("""
                        SELECT pp.PromotionId, pp.ProductId, pp.Amount, pp.Provider, pp.ProviderReference, pp.Status, pp.IsSandbox, pk.DurationHours
                        FROM dbo.ProductPromotions pp WITH (UPDLOCK, HOLDLOCK) JOIN dbo.PromotionPackages pk ON pk.PackageId = pp.PackageId
                        WHERE pp.RequestKey = :key""", Map.of("key", n.requestKey())).stream().findFirst()
                        .orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_MISMATCH, "Unknown payment request."));
                if (sandboxOnly && !Boolean.TRUE.equals(row.get("IsSandbox"))) {
                    throw new ApiException(ErrorCode.PAYMENT_MISMATCH, "Unknown payment request.");
                }
                if (!provider.equals(row.get("Provider")) || ((java.math.BigDecimal) row.get("Amount")).longValueExact() != n.amount()) {
                    throw new ApiException(ErrorCode.PAYMENT_MISMATCH);
                }
                String current = (String) row.get("Status");
                if (!"Pending".equals(current)) {
                    boolean same = n.providerReference().equals(row.get("ProviderReference")) && ("Paid".equals(current) == n.success());
                    if (same) {
                        return "DUPLICATE_IGNORED";
                    }
                    throw new ApiException(ErrorCode.PAYMENT_CONFLICT);
                }
                long id = ((Number) row.get("PromotionId")).longValue();
                if (n.success()) {
                    jdbc.update("""
                            UPDATE pp SET Status = 'Paid', ProviderReference = :ref, StartsAt = w.StartsAt,
                                   EndsAt = DATEADD(hour, :hours, w.StartsAt)
                            FROM dbo.ProductPromotions pp
                            CROSS APPLY (SELECT CASE WHEN MAX(o.EndsAt) > SYSUTCDATETIME() THEN MAX(o.EndsAt)
                                                     -- truncated: datetime2(0) would round 12:00:00.7 UP to 12:00:01 (a future start)
                                                     ELSE DATETRUNC(second, SYSUTCDATETIME()) END AS StartsAt
                                         FROM dbo.ProductPromotions o WHERE o.ProductId = pp.ProductId AND o.Status = 'Paid' AND o.PromotionId <> pp.PromotionId) w
                            WHERE pp.PromotionId = :id AND pp.Status = 'Pending'""",
                            Map.of("id", id, "ref", n.providerReference(), "hours", row.get("DurationHours")));
                } else {
                    jdbc.update("UPDATE dbo.ProductPromotions SET Status = 'Failed', ProviderReference = :ref WHERE PromotionId = :id AND Status = 'Pending'",
                            Map.of("id", id, "ref", n.providerReference()));
                }
                return "RECORDED";
            });
        } catch (DataAccessException ex) {
            if (SqlErrors.isDuplicateKey(ex)) {
                throw new ApiException(ErrorCode.PAYMENT_CONFLICT);
            }
            throw ex;
        }
        String status = jdbc.queryForObject("SELECT Status FROM dbo.ProductPromotions WHERE RequestKey = :key", Map.of("key", n.requestKey()), String.class);
        log.info("Promotion payment {}: {} ({})", n.requestKey().substring(0, 4) + "…", status, outcome);
        return new PaymentResponses.CallbackResult(outcome, OrderValues.upper(status), null);
    }

    // ------------------------------------------------------------------ helpers

    private PromotionDtos.Promotion one(long id, Boolean resumed) {
        return jdbc.query(PROMOTION_SQL + " WHERE pp.PromotionId = :id", Map.of("id", id), (rs, i) -> promotion(rs, resumed))
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Promotion not found."));
    }

    private static final String PROMOTION_SQL = """
            SELECT pp.PromotionId, pp.ProductId, p.Title, pk.PackageId, pk.Name, pk.DurationHours, pk.Price, pp.Amount, pp.Provider, pp.Status,
                   pp.StartsAt, pp.EndsAt, pp.IsSandbox,
                   CAST(CASE WHEN pp.Status = 'Paid' AND pp.StartsAt <= SYSUTCDATETIME() AND pp.EndsAt > SYSUTCDATETIME() THEN 1 ELSE 0 END AS bit) AS Active
            FROM dbo.ProductPromotions pp
            JOIN dbo.Products p ON p.ProductId = pp.ProductId
            JOIN dbo.PromotionPackages pk ON pk.PackageId = pp.PackageId
            """;

    private PromotionDtos.Promotion promotion(ResultSet rs, Boolean resumed) throws SQLException {
        boolean sandbox = rs.getBoolean("IsSandbox");
        String status = rs.getString("Status");
        return new PromotionDtos.Promotion(rs.getLong("PromotionId"), rs.getInt("ProductId"), rs.getString("Title"),
                new PromotionDtos.PromotionPackage(rs.getInt("PackageId"), rs.getString("Name"), rs.getInt("DurationHours"),
                        rs.getBigDecimal("Price").longValueExact()),
                rs.getBigDecimal("Amount").longValueExact(), OrderValues.provider(rs.getString("Provider")), OrderValues.upper(status),
                rs.getBoolean("Active"), utc(rs, "StartsAt"), utc(rs, "EndsAt"), sandbox, resumed,
                simulatorEnabled && sandbox && "Pending".equals(status)
                        ? "/api/dev/payment-simulator/promotions/" + rs.getLong("PromotionId") + "/complete" : null);
    }

    private static Instant utc(ResultSet rs, String column) throws SQLException {
        LocalDateTime value = rs.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private static byte[] randomBytes() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return bytes;
    }
}
