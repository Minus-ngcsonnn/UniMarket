package com.unimarket.service.order;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Calls the V002 order procedures. These are the ONLY code paths that change orders, payments, deliveries,
 * settlements and disputes; the procedures enforce the state machine, the locks and the money rules.
 *
 * <p>Each call runs in the procedure's own transaction ({@code SET XACT_ABORT ON}, all-or-nothing). Errors are
 * returned as {@link org.springframework.dao.DataAccessException}; callers translate the SQL error number
 * ({@link SqlErrors#numberOf}).</p>
 */
@Repository
@Profile("!nodb")
public class OrderProcedures {

    private final JdbcTemplate jdbc;

    public OrderProcedures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * {@code usp_Checkout}: ONE call for the whole checkout. The procedure groups the listings by seller and creates
     * one order per seller inside a single transaction; if any listing fails, nothing is created or reserved.
     *
     * @return the created order ids
     */
    public List<Long> checkout(int buyerId, List<Integer> productIds, String recipientName, String recipientPhone,
                               String deliveryAddress, String providerSql, BigDecimal shippingFee) {
        // The table-valued parameter dbo.ProductIdList is filled in the same batch from a JSON array of integers
        // (built here from Integer values only, and passed as a bound parameter), then the procedure is called ONCE.
        String idsJson = productIds.stream().map(id -> Integer.toString(id)).collect(Collectors.joining(",", "[", "]"));
        return jdbc.execute((ConnectionCallback<List<Long>>) connection -> {
            // No SET NOCOUNT here: it would stay on for this pooled connection after the batch. The INSERT's
            // update count is skipped by the result loop below.
            try (PreparedStatement statement = connection.prepareStatement("""
                    DECLARE @ids dbo.ProductIdList;
                    INSERT @ids (ProductId) SELECT CAST([value] AS int) FROM OPENJSON(?);
                    EXEC dbo.usp_Checkout @BuyerId = ?, @ProductIds = @ids, @RecipientName = ?, @RecipientPhone = ?,
                         @DeliveryAddress = ?, @PaymentProvider = ?, @ShippingFee = ?;""")) {
                statement.setString(1, idsJson);
                statement.setInt(2, buyerId);
                statement.setString(3, recipientName);
                statement.setString(4, recipientPhone);
                statement.setString(5, deliveryAddress);
                statement.setString(6, providerSql);
                statement.setBigDecimal(7, shippingFee);
                List<Long> created = new ArrayList<>();
                boolean isResultSet = statement.execute();
                while (true) {
                    if (isResultSet) {
                        try (ResultSet rs = statement.getResultSet()) {
                            while (rs.next()) {
                                created.add(rs.getLong("OrderId"));
                            }
                        }
                    } else if (statement.getUpdateCount() == -1) {
                        break;
                    }
                    isResultSet = statement.getMoreResults();
                }
                return created;
            }
        });
    }

    /** {@code usp_ConfirmOrder}: Pending → AwaitingPayment (seller, before ConfirmBy). */
    public void confirm(long orderId, int sellerId) {
        jdbc.update("EXEC dbo.usp_ConfirmOrder @OrderId = ?, @SellerId = ?", orderId, sellerId);
    }

    /** {@code usp_CancelOrder}: Pending / AwaitingPayment → Cancelled, releases every listing (buyer, seller or admin). */
    public void cancel(long orderId, int actorId, String reason) {
        jdbc.update("EXEC dbo.usp_CancelOrder @OrderId = ?, @ActorId = ?, @Reason = ?", orderId, actorId, reason);
    }

    /** {@code usp_ShipOrder}: Paid → Delivering (seller), creates the delivery record. */
    public void ship(long orderId, int sellerId, String carrier, String trackingNumber) {
        jdbc.update("EXEC dbo.usp_ShipOrder @OrderId = ?, @SellerId = ?, @Carrier = ?, @TrackingNumber = ?",
                orderId, sellerId, carrier, trackingNumber);
    }

    /** {@code usp_CompleteOrder}: Delivering → Completed (buyer), listings Sold, one Pending settlement. */
    public void complete(long orderId, int buyerId) {
        jdbc.update("EXEC dbo.usp_CompleteOrder @OrderId = ?, @BuyerId = ?", orderId, buyerId);
    }

    /** {@code usp_StartPayment}: new payment attempt for an AwaitingPayment order before PaymentDueAt. */
    public long startPayment(long orderId, int buyerId, String requestKey, boolean sandbox, String providerSql) {
        Long id = jdbc.queryForObject("EXEC dbo.usp_StartPayment @OrderId = ?, @BuyerId = ?, @RequestKey = ?, @IsSandbox = ?, @Provider = ?",
                Long.class, orderId, buyerId, requestKey, sandbox, providerSql);
        return id == null ? -1 : id;
    }

    /**
     * {@code usp_RecordPaymentResult}: records a VERIFIED provider result. Only call after the notification has been
     * authenticated; the procedure checks attempt, amount, provider, duplicates and the deadline / 30-minute grace.
     */
    public void recordPaymentResult(String requestKey, String providerReference, BigDecimal amount, boolean success, String providerSql) {
        jdbc.update("EXEC dbo.usp_RecordPaymentResult @RequestKey = ?, @ProviderReference = ?, @Amount = ?, @Success = ?, @Provider = ?",
                requestKey, providerReference, amount, success, providerSql);
    }

    /** {@code usp_OpenOrderDispute}: buyer or seller of a paid order (D3). */
    public long openDispute(long orderId, int userId, String reason) {
        Long id = jdbc.queryForObject("EXEC dbo.usp_OpenOrderDispute @OrderId = ?, @UserId = ?, @Reason = ?", Long.class, orderId, userId, reason);
        return id == null ? -1 : id;
    }

    /**
     * {@code usp_ExpirePendingOrders}: cancels orders past their seller-confirmation or payment deadline (with the
     * 30-minute grace for attempts in flight) and releases their listings.
     *
     * @return the expired orders (id and previous status)
     */
    public List<Expired> expirePendingOrders() {
        return jdbc.query("EXEC dbo.usp_ExpirePendingOrders", (rs, i) -> new Expired(rs.getLong("OrderId"), rs.getString("OldStatus")));
    }

    /** @param orderId expired order; @param previousStatus Pending or AwaitingPayment */
    public record Expired(long orderId, String previousStatus) {
    }
}
