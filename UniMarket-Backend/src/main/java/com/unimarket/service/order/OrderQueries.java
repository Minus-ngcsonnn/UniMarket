package com.unimarket.service.order;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Read-only SQL for cart, orders, payments and their history (V002 tables). Every state change goes through
 * the V002 stored procedures instead (see {@link OrderProcedures}).
 *
 * <p>Times are {@code datetime2} values written with {@code SYSUTCDATETIME()}; they are read as
 * {@link LocalDateTime} (no driver time-zone conversion) and interpreted as UTC.</p>
 */
@Repository
@Profile("!nodb")
public class OrderQueries {

    private static final String ORDER_COLUMNS = """
            SELECT o.OrderId, o.BuyerId, o.SellerId, o.Status, o.Subtotal, o.ShippingFee, o.TotalAmount, o.CommissionRate,
                   o.CommissionAmount, o.SellerProceeds, o.SellerPayoutTotal, o.PaymentProvider, o.RecipientName, o.RecipientPhone,
                   o.DeliveryAddress, o.CreatedAt, o.ConfirmBy, o.ConfirmedAt, o.PaymentDueAt, o.PaidAt, o.ShippedAt, o.CompletedAt,
                   o.CancelledAt, o.CancellationReason, b.FullName AS BuyerName, s.FullName AS SellerName,
                   CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.OrderId = o.OrderId AND p.Status = 'Pending') THEN 1 ELSE 0 END AS bit) AS HasPendingPayment,
                   CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.OrderDisputes d WHERE d.OrderId = o.OrderId AND d.Status = 'Open') THEN 1 ELSE 0 END AS bit) AS HasOpenDispute,
                   (SELECT st.Status FROM dbo.SellerSettlements st WHERE st.OrderId = o.OrderId) AS SettlementStatus
            FROM dbo.Orders AS o
            JOIN dbo.Users AS b ON b.UserId = o.BuyerId
            JOIN dbo.Users AS s ON s.UserId = o.SellerId
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public OrderQueries(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ orders

    /** @return the order header, or empty */
    public Optional<OrderRow> order(long orderId) {
        return jdbc.query(ORDER_COLUMNS + " WHERE o.OrderId = :id", Map.of("id", orderId), OrderQueries::orderRow).stream().findFirst();
    }

    /** @return the given orders, newest first */
    public List<OrderRow> orders(Collection<Long> orderIds) {
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.query(ORDER_COLUMNS + " WHERE o.OrderId IN (:ids) ORDER BY o.CreatedAt DESC, o.OrderId DESC",
                Map.of("ids", orderIds), OrderQueries::orderRow);
    }

    /**
     * One page of a user's orders as buyer or seller, newest first.
     *
     * @param asSeller    true: orders where the user sells; false: where the user buys
     * @param sqlStatuses status filter (SQL values), empty for all
     */
    public List<OrderRow> ordersOf(int userId, boolean asSeller, List<String> sqlStatuses, int offset, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource("user", userId).addValue("offset", offset).addValue("limit", limit)
                .addValue("statuses", sqlStatuses.isEmpty() ? List.of("-") : sqlStatuses);
        String where = (asSeller ? " WHERE o.SellerId = :user" : " WHERE o.BuyerId = :user")
                + (sqlStatuses.isEmpty() ? "" : " AND o.Status IN (:statuses)");
        return jdbc.query(ORDER_COLUMNS + where + " ORDER BY o.CreatedAt DESC, o.OrderId DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY",
                params, OrderQueries::orderRow);
    }

    /** @return number of a user's orders for {@link #ordersOf} */
    public long countOrdersOf(int userId, boolean asSeller, List<String> sqlStatuses) {
        MapSqlParameterSource params = new MapSqlParameterSource("user", userId)
                .addValue("statuses", sqlStatuses.isEmpty() ? List.of("-") : sqlStatuses);
        String where = (asSeller ? " WHERE SellerId = :user" : " WHERE BuyerId = :user")
                + (sqlStatuses.isEmpty() ? "" : " AND Status IN (:statuses)");
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders" + where, params, Long.class);
        return count == null ? 0 : count;
    }

    /** Orders waiting for this user: as buyer (pay, confirm receipt) and as seller (confirm, ship). */
    public Map<String, Long> actionCounts(int userId) {
        return jdbc.queryForObject("""
                SELECT SUM(CASE WHEN BuyerId = :user AND Status IN ('AwaitingPayment', 'Delivering') THEN 1 ELSE 0 END) AS buyer,
                       SUM(CASE WHEN SellerId = :user AND Status IN ('Pending', 'Paid') THEN 1 ELSE 0 END) AS seller
                FROM dbo.Orders WHERE BuyerId = :user OR SellerId = :user""", Map.of("user", userId),
                (rs, i) -> Map.of("buyer", rs.getLong("buyer"), "seller", rs.getLong("seller")));
    }

    /** Items of several orders (title and price snapshots), with the listing's current main photo. */
    public Map<Long, List<ItemRow>> items(Collection<Long> orderIds) {
        Map<Long, List<ItemRow>> byOrder = new LinkedHashMap<>();
        if (orderIds.isEmpty()) {
            return byOrder;
        }
        jdbc.query("""
                SELECT oi.OrderId, oi.ProductId, oi.ProductTitle, oi.UnitPrice, oi.Quantity, img.ImageUrl
                FROM dbo.OrderItems AS oi
                OUTER APPLY (SELECT TOP (1) i.ImageUrl FROM dbo.ProductImages AS i WHERE i.ProductId = oi.ProductId ORDER BY i.SortOrder, i.ImageId) AS img
                WHERE oi.OrderId IN (:ids) ORDER BY oi.OrderId, oi.OrderItemId""", Map.of("ids", orderIds), rs -> {
            byOrder.computeIfAbsent(rs.getLong("OrderId"), k -> new ArrayList<>()).add(new ItemRow(rs.getInt("ProductId"),
                    rs.getString("ProductTitle"), rs.getBigDecimal("UnitPrice"), rs.getInt("Quantity"), rs.getString("ImageUrl")));
        });
        return byOrder;
    }

    public List<PaymentRow> payments(long orderId) {
        return jdbc.query("""
                SELECT PaymentId, OrderId, Provider, Status, Amount, IsSandbox, RequestKey, ProviderReference, CreatedAt, FinishedAt
                FROM dbo.Payments WHERE OrderId = :id ORDER BY PaymentId""", Map.of("id", orderId), OrderQueries::paymentRow);
    }

    public Optional<PaymentRow> payment(long paymentId) {
        return jdbc.query("""
                SELECT PaymentId, OrderId, Provider, Status, Amount, IsSandbox, RequestKey, ProviderReference, CreatedAt, FinishedAt
                FROM dbo.Payments WHERE PaymentId = :id""", Map.of("id", paymentId), OrderQueries::paymentRow).stream().findFirst();
    }

    public Optional<PaymentRow> paymentByRequestKey(String requestKey) {
        return jdbc.query("""
                SELECT PaymentId, OrderId, Provider, Status, Amount, IsSandbox, RequestKey, ProviderReference, CreatedAt, FinishedAt
                FROM dbo.Payments WHERE RequestKey = :key""", Map.of("key", requestKey), OrderQueries::paymentRow).stream().findFirst();
    }

    public List<HistoryRow> history(long orderId) {
        return jdbc.query("SELECT Status, ChangedBy, Note, ChangedAt FROM dbo.OrderStatusHistory WHERE OrderId = :id ORDER BY ChangedAt, HistoryId",
                Map.of("id", orderId), (rs, i) -> new HistoryRow(rs.getString("Status"), (Integer) rs.getObject("ChangedBy"),
                        rs.getString("Note"), utc(rs, "ChangedAt")));
    }

    public Optional<ShipmentRow> shipment(long orderId) {
        return jdbc.query("SELECT Carrier, TrackingNumber, ShippedAt, ReceivedAt FROM dbo.Deliveries WHERE OrderId = :id",
                Map.of("id", orderId), (rs, i) -> new ShipmentRow(rs.getString("Carrier"), rs.getString("TrackingNumber"),
                        utc(rs, "ShippedAt"), utc(rs, "ReceivedAt"))).stream().findFirst();
    }

    public List<DisputeRow> disputes(long orderId) {
        return jdbc.query("""
                SELECT DisputeId, OpenedBy, Reason, Status, Decision, Resolution, RefundConfirmedAt, CreatedAt, ResolvedAt
                FROM dbo.OrderDisputes WHERE OrderId = :id ORDER BY DisputeId""", Map.of("id", orderId),
                (rs, i) -> new DisputeRow(rs.getLong("DisputeId"), rs.getInt("OpenedBy"), rs.getString("Reason"), rs.getString("Status"),
                        rs.getString("Decision"), rs.getString("Resolution"), rs.getObject("RefundConfirmedAt") != null,
                        utc(rs, "CreatedAt"), utc(rs, "ResolvedAt")));
    }

    public Optional<SettlementRow> settlement(long orderId) {
        return jdbc.query("""
                SELECT Status, Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee, IsSandbox, CreatedAt, ReleasedAt
                FROM dbo.SellerSettlements WHERE OrderId = :id""", Map.of("id", orderId),
                (rs, i) -> new SettlementRow(rs.getString("Status"), rs.getBigDecimal("Amount"), rs.getBigDecimal("MerchandiseSubtotal"),
                        rs.getBigDecimal("CommissionAmount"), rs.getBigDecimal("ShippingFee"), rs.getBoolean("IsSandbox"),
                        utc(rs, "CreatedAt"), utc(rs, "ReleasedAt"))).stream().findFirst();
    }

    // ------------------------------------------------------------------ listings and cart

    /**
     * Current state of listings for cart and checkout checks: the same conditions {@code usp_Checkout} uses
     * (Available, Approved, seller active and verified, category active).
     */
    public Map<Integer, ListingRow> listings(Collection<Integer> productIds) {
        Map<Integer, ListingRow> rows = new LinkedHashMap<>();
        if (productIds.isEmpty()) {
            return rows;
        }
        jdbc.query(listingSql("CAST(NULL AS datetime2)", "") + " WHERE p.ProductId IN (:ids)", Map.of("ids", productIds), rs -> {
            ListingRow row = listingRow(rs);
            rows.put(row.productId(), row);
        });
        return rows;
    }

    /** The user's cart with the current state of each listing, oldest first. */
    public List<ListingRow> cart(int userId) {
        return jdbc.query(listingSql("ci.AddedAt", " JOIN dbo.CartItems AS ci ON ci.ProductId = p.ProductId AND ci.UserId = :user")
                        + " ORDER BY ci.AddedAt, p.ProductId", Map.of("user", userId), (rs, i) -> listingRow(rs));
    }

    /**
     * Listings among {@code productIds} that are in a non-cancelled order of this buyer (vw_ActiveOrderItems),
     * with that order id. Used to explain a refused retry of a checkout that already succeeded.
     */
    public Map<Integer, Long> activeOrdersOfBuyer(Collection<Integer> productIds, int buyerId) {
        Map<Integer, Long> orders = new LinkedHashMap<>();
        if (productIds.isEmpty()) {
            return orders;
        }
        jdbc.query("""
                SELECT a.ProductId, a.OrderId FROM dbo.vw_ActiveOrderItems AS a JOIN dbo.Orders AS o ON o.OrderId = a.OrderId
                WHERE a.ProductId IN (:ids) AND o.BuyerId = :buyer""", Map.of("ids", productIds, "buyer", buyerId),
                rs -> { orders.put(rs.getInt("ProductId"), rs.getLong("OrderId")); });
        return orders;
    }

    public int cartSize(int userId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.CartItems WHERE UserId = :user", Map.of("user", userId), Integer.class);
        return count == null ? 0 : count;
    }

    /** @param addedAtExpression SQL for the AddedAt column (fixed text, never user input); @param join extra join (fixed text) */
    private static String listingSql(String addedAtExpression, String join) {
        return """
                SELECT p.ProductId, p.SellerId, p.Title, p.Price, p.Status, p.ModerationStatus, s.FullName AS SellerName,
                       CAST(CASE WHEN s.Status = 'Active' AND s.EmailVerifiedAt IS NOT NULL THEN 1 ELSE 0 END AS bit) AS SellerEligible,
                       c.IsActive AS CategoryActive, img.ImageUrl, %s AS AddedAt
                FROM dbo.Products AS p
                JOIN dbo.Users AS s ON s.UserId = p.SellerId
                JOIN dbo.Categories AS c ON c.CategoryId = p.CategoryId%s
                OUTER APPLY (SELECT TOP (1) i.ImageUrl FROM dbo.ProductImages AS i WHERE i.ProductId = p.ProductId ORDER BY i.SortOrder, i.ImageId) AS img
                """.formatted(addedAtExpression, join);
    }

    // ------------------------------------------------------------------ rows

    private static OrderRow orderRow(ResultSet rs, int rowNum) throws SQLException {
        return new OrderRow(rs.getLong("OrderId"), rs.getInt("BuyerId"), rs.getInt("SellerId"), rs.getString("Status"),
                rs.getBigDecimal("Subtotal"), rs.getBigDecimal("ShippingFee"), rs.getBigDecimal("TotalAmount"), rs.getBigDecimal("CommissionRate"),
                rs.getBigDecimal("CommissionAmount"), rs.getBigDecimal("SellerProceeds"), rs.getBigDecimal("SellerPayoutTotal"),
                rs.getString("PaymentProvider"), rs.getString("RecipientName"), rs.getString("RecipientPhone"), rs.getString("DeliveryAddress"),
                utc(rs, "CreatedAt"), utc(rs, "ConfirmBy"), utc(rs, "ConfirmedAt"), utc(rs, "PaymentDueAt"), utc(rs, "PaidAt"),
                utc(rs, "ShippedAt"), utc(rs, "CompletedAt"), utc(rs, "CancelledAt"), rs.getString("CancellationReason"),
                rs.getString("BuyerName"), rs.getString("SellerName"), rs.getBoolean("HasPendingPayment"), rs.getBoolean("HasOpenDispute"),
                rs.getString("SettlementStatus"));
    }

    private static PaymentRow paymentRow(ResultSet rs, int rowNum) throws SQLException {
        return new PaymentRow(rs.getLong("PaymentId"), rs.getLong("OrderId"), rs.getString("Provider"), rs.getString("Status"),
                rs.getBigDecimal("Amount"), rs.getBoolean("IsSandbox"), rs.getString("RequestKey"), rs.getString("ProviderReference"),
                utc(rs, "CreatedAt"), utc(rs, "FinishedAt"));
    }

    private static ListingRow listingRow(ResultSet rs) throws SQLException {
        return new ListingRow(rs.getInt("ProductId"), rs.getInt("SellerId"), rs.getString("Title"), rs.getBigDecimal("Price"),
                rs.getString("Status"), rs.getString("ModerationStatus"), rs.getString("SellerName"), rs.getBoolean("SellerEligible"),
                rs.getBoolean("CategoryActive"), rs.getString("ImageUrl"), utc(rs, "AddedAt"));
    }

    /** Reads a UTC {@code datetime2} column without any time-zone conversion. */
    static Instant utc(ResultSet rs, String column) throws SQLException {
        LocalDateTime value = rs.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    // ------------------------------------------------------------------ row types

    public record OrderRow(long id, int buyerId, int sellerId, String status, BigDecimal subtotal, BigDecimal shippingFee,
                           BigDecimal totalAmount, BigDecimal commissionRate, BigDecimal commissionAmount, BigDecimal sellerProceeds,
                           BigDecimal sellerPayoutTotal, String paymentProvider, String recipientName, String recipientPhone,
                           String deliveryAddress, Instant createdAt, Instant confirmBy, Instant confirmedAt, Instant paymentDueAt,
                           Instant paidAt, Instant shippedAt, Instant completedAt, Instant cancelledAt, String cancellationReason,
                           String buyerName, String sellerName, boolean hasPendingPayment, boolean hasOpenDispute, String settlementStatus) {
    }

    public record ItemRow(int productId, String title, BigDecimal unitPrice, int quantity, String imageUrl) {
    }

    public record PaymentRow(long id, long orderId, String provider, String status, BigDecimal amount, boolean sandbox,
                             String requestKey, String providerReference, Instant createdAt, Instant finishedAt) {
    }

    public record HistoryRow(String status, Integer changedBy, String note, Instant changedAt) {
    }

    public record ShipmentRow(String carrier, String trackingNumber, Instant shippedAt, Instant receivedAt) {
    }

    public record DisputeRow(long id, int openedBy, String reason, String status, String decision, String resolution,
                             boolean refundConfirmed, Instant createdAt, Instant resolvedAt) {
    }

    public record SettlementRow(String status, BigDecimal amount, BigDecimal merchandiseSubtotal, BigDecimal commission,
                                BigDecimal shippingFee, boolean sandbox, Instant createdAt, Instant releasedAt) {
    }

    /**
     * @param purchasable-relevant fields mirror the conditions of {@code usp_Checkout}
     */
    public record ListingRow(int productId, int sellerId, String title, BigDecimal price, String status, String moderationStatus,
                             String sellerName, boolean sellerEligible, boolean categoryActive, String imageUrl, Instant addedAt) {

        /** Same conditions as {@code usp_Checkout} / {@code trg_Cart_Validate}, except the buyer check. */
        public boolean purchasable() {
            return "Available".equals(status) && "Approved".equals(moderationStatus) && sellerEligible && categoryActive;
        }

        /** Why the listing cannot be bought now, or null. */
        public String unavailableReason(int buyerId) {
            if (sellerId == buyerId) {
                return "OWN_LISTING";
            }
            if ("Reserved".equals(status)) {
                return "RESERVED";
            }
            if ("Sold".equals(status)) {
                return "SOLD";
            }
            if (!"Available".equals(status)) {
                return "REMOVED";
            }
            if (!"Approved".equals(moderationStatus)) {
                return "UNDER_REVIEW";
            }
            if (!sellerEligible) {
                return "SELLER_UNAVAILABLE";
            }
            if (!categoryActive) {
                return "CATEGORY_UNAVAILABLE";
            }
            return null;
        }
    }
}
