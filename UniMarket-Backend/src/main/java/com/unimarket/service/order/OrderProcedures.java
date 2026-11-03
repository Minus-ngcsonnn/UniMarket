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
     * V003 {@code usp_CheckoutWithShipping}: ONE call for the whole checkout. It runs the unchanged V002
     * {@code usp_Checkout} and then stores each seller order's verified simulated shipping fee and quote, all in ONE
     * transaction (all-or-nothing).
     *
     * <p>Result sets: the nested {@code usp_Checkout} returns its own (OrderId, SellerId) set first, and that set is sent
     * to the client EVEN WHEN a later check fails and everything is rolled back (proved on the isolated copy). Only the
     * LAST result set, read after the batch finished without error, is the outcome. An error raised after the first set
     * surfaces from {@code getMoreResults()} as an exception, so no order id is returned in that case.</p>
     *
     * @return the created order ids (from the last result set)
     */
    public List<Long> checkoutWithShipping(int buyerId, List<Integer> productIds, int deliveryZoneId,
                                           List<com.unimarket.service.shipping.ShippingQuoteService.ConfirmedShipping> shipping,
                                           String recipientName, String recipientPhone, String deliveryAddress, String providerSql) {
        String idsJson = productIds.stream().map(id -> Integer.toString(id)).collect(Collectors.joining(",", "[", "]"));
        // Built from typed values only (ints, enum carrier names, whole numbers) and passed as ONE bound parameter.
        String shippingJson = shipping.stream().map(s -> "{\"s\":" + s.sellerId() + ",\"c\":\"" + s.carrier() + "\",\"z\":"
                        + s.pickupZoneId() + ",\"d\":" + s.distanceKm().toPlainString() + ",\"f\":" + s.fee()
                        + ",\"v\":\"" + s.formulaVersion() + "\"}")
                .collect(Collectors.joining(",", "[", "]"));
        return jdbc.execute((ConnectionCallback<List<Long>>) connection -> {
            try (PreparedStatement statement = connection.prepareStatement("""
                    DECLARE @ids dbo.ProductIdList, @ship dbo.SellerShippingList;
                    INSERT @ids (ProductId) SELECT CAST([value] AS int) FROM OPENJSON(?);
                    INSERT @ship (SellerId, Carrier, PickupZoneId, DistanceKm, Fee, FormulaVersion)
                    SELECT s, c, z, d, f, v FROM OPENJSON(?) WITH (s int, c varchar(30), z int, d decimal(6,1), f decimal(18,0), v varchar(20));
                    EXEC dbo.usp_CheckoutWithShipping @BuyerId = ?, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = ?,
                         @RecipientName = ?, @RecipientPhone = ?, @DeliveryAddress = ?, @PaymentProvider = ?;""")) {
                statement.setString(1, idsJson);
                statement.setString(2, shippingJson);
                statement.setInt(3, buyerId);
                statement.setInt(4, deliveryZoneId);
                statement.setString(5, recipientName);
                statement.setString(6, recipientPhone);
                statement.setString(7, deliveryAddress);
                statement.setString(8, providerSql);
                List<Long> last = List.of();
                boolean isResultSet = statement.execute();
                while (true) {
                    if (isResultSet) {
                        List<Long> current = new ArrayList<>();
                        try (ResultSet rs = statement.getResultSet()) {
                            while (rs.next()) {
                                current.add(rs.getLong("OrderId"));
                            }
                        }
                        last = current;
                    } else if (statement.getUpdateCount() == -1) {
                        break;
                    }
                    isResultSet = statement.getMoreResults();
                }
                return last;
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
