package com.unimarket.dto.order;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/**
 * One order (one buyer, one seller, one or more listings of that seller), as seen by one viewer.
 *
 * <p>All amounts are whole VND read from the database's computed columns (V002, decisions D1/D4); the API never
 * recalculates them. Parts the viewer may not see, and the detail-only parts in lists, are omitted.</p>
 *
 * @param id                 {@code Orders.OrderId}
 * @param code               display code, e.g. {@code UO-15}
 * @param status             PENDING, AWAITING_PAYMENT, PAID, DELIVERING, COMPLETED, CANCELLED
 * @param role               the viewer's role in this order: BUYER, SELLER or ADMIN
 * @param buyer              buyer (id, name)
 * @param seller             seller (id, name)
 * @param items              listings with the title and price recorded at checkout
 * @param amounts            money breakdown
 * @param paymentProvider    MOMO, ZALOPAY or BANK_QR once chosen
 * @param delivery           recipient name, phone and address: buyer and admin always; the seller only while the order
 *                           is PAID or DELIVERING (after the verified payment, to deliver)
 * @param deadlines          seller confirmation deadline and buyer payment deadline (UTC)
 * @param timestamps         when each step happened (UTC)
 * @param cancellationReason why the order was cancelled
 * @param shipment           carrier / tracking once shipped (detail only)
 * @param payments           payment attempts (detail only; buyer and admin)
 * @param history            status history (detail only)
 * @param disputes           disputes (detail only)
 * @param settlement         seller payout record (detail only; seller and admin)
 * @param actions            what the viewer can do now (a hint for buttons; the server checks again)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OrderResponse(
        long id, String code, String status, String role, Party buyer, Party seller, List<Item> items, Amounts amounts,
        String paymentProvider, Delivery delivery, Deadlines deadlines, Timestamps timestamps, String cancellationReason,
        Shipment shipment, List<Payment> payments, List<HistoryEntry> history, List<Dispute> disputes, Settlement settlement,
        List<String> actions, com.unimarket.dto.shipping.ShippingDtos.OrderShipping shipping) {

    /** Display code used by the frontend ({@code orderCode}). */
    public static String codeOf(long orderId) {
        return "UO-" + orderId;
    }

    /** @param id user id; @param fullName display name */
    public record Party(int id, String fullName) {
    }

    /**
     * @param productId listing id
     * @param title     {@code OrderItems.ProductTitle} (snapshot at checkout)
     * @param unitPrice {@code OrderItems.UnitPrice} (snapshot at checkout)
     * @param quantity  always 1 (second-hand item)
     * @param imageUrl  current main photo of the listing (not a snapshot), may be null
     */
    public record Item(int productId, String title, long unitPrice, int quantity, String imageUrl) {
    }

    /**
     * Money breakdown. {@code commission}, {@code sellerProceeds} and {@code sellerPayout} are only sent to the
     * seller and admins.
     *
     * @param subtotal       sum of item prices (Orders.Subtotal)
     * @param shippingFee    delivery fee paid by the buyer, passed fully to the seller (D1)
     * @param total          what the buyer pays: subtotal + shipping fee (Orders.TotalAmount)
     * @param commissionRate 0.03 (D4)
     * @param commission     ROUND(subtotal × 3 %) (Orders.CommissionAmount)
     * @param sellerProceeds subtotal − commission (Orders.SellerProceeds)
     * @param sellerPayout   seller proceeds + shipping fee (Orders.SellerPayoutTotal)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Amounts(long subtotal, long shippingFee, long total, java.math.BigDecimal commissionRate, Long commission,
                          Long sellerProceeds, Long sellerPayout) {
    }

    /** Delivery details given at checkout. */
    public record Delivery(String recipientName, String recipientPhone, String address) {
    }

    /**
     * @param confirmBy    seller must confirm before this (placement + 24 h)
     * @param paymentDueAt buyer must pay before this (confirmation + 24 h); null until confirmed
     */
    public record Deadlines(Instant confirmBy, Instant paymentDueAt) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Timestamps(Instant createdAt, Instant confirmedAt, Instant paidAt, Instant shippedAt, Instant completedAt,
                             Instant cancelledAt) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Shipment(String carrier, String trackingNumber, Instant shippedAt, Instant receivedAt) {
    }

    /**
     * A payment attempt. References (request key, provider reference) are never sent.
     *
     * @param sandbox true for simulated payments (no real money)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Payment(long id, String provider, String status, long amount, boolean sandbox, Instant createdAt, Instant finishedAt) {
    }

    /**
     * @param status    order status at that point
     * @param changedBy BUYER, SELLER, ADMIN or SYSTEM (deadline expiry, payment provider)
     * @param note      e.g. cancellation reason, "Dispute opened"
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record HistoryEntry(String status, String changedBy, String note, Instant changedAt) {
    }

    /**
     * @param openedBy        BUYER or SELLER
     * @param status          OPEN or RESOLVED
     * @param decision        NO_REFUND or REFUND_APPROVED (admin decision only; refunds are manual, D3)
     * @param refundConfirmed true once an admin recorded that the refund was really made outside UniMarket
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Dispute(long id, String openedBy, String reason, String status, String decision, String resolution,
                          boolean refundConfirmed, Instant createdAt, Instant resolvedAt) {
    }

    /**
     * Seller payout (D6). {@code PENDING} = calculated and owed, not paid; {@code RELEASED} = an admin confirmed a manual
     * transfer. UniMarket never moves money automatically.
     *
     * @param sandbox     true when the order was paid in the simulated (sandbox) payment flow: no real money exists
     * @param calculation {@code STANDARD} (amount = sellerPayout of the order) or {@code LEGACY_V001_MERCHANDISE_ONLY}
     *                    (V001 demo record without the delivery fee, kept unchanged; see SettlementCalculation)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Settlement(String status, long amount, long merchandiseSubtotal, long commission, long shippingFee,
                             boolean sandbox, Instant createdAt, Instant releasedAt, String calculation) {
    }
}
