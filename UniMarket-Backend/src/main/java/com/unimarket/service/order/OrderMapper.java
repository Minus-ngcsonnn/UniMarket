package com.unimarket.service.order;

import com.unimarket.dto.order.OrderResponse;
import com.unimarket.service.product.ProductMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns order rows into {@link OrderResponse} for one viewer.
 *
 * <p>Visibility: the buyer sees what they pay (subtotal, delivery fee, total) and their payment attempts; the seller
 * additionally sees commission, proceeds, payout and the settlement, and the recipient's delivery details only while
 * the order is PAID or DELIVERING ({@link #sellerNeedsDeliveryDetails}); admins see everything. Payment references
 * are never returned.</p>
 */
final class OrderMapper {

    static final String BUYER = "BUYER";
    static final String SELLER = "SELLER";
    static final String ADMIN = "ADMIN";

    private OrderMapper() {
    }

    static OrderResponse summary(OrderQueries.OrderRow order, List<OrderQueries.ItemRow> items, String role, Instant now) {
        return build(order, items, role, now, null);
    }

    static OrderResponse detail(OrderQueries.OrderRow order, List<OrderQueries.ItemRow> items, String role, Instant now, Details details) {
        return build(order, items, role, now, details);
    }

    private static OrderResponse build(OrderQueries.OrderRow o, List<OrderQueries.ItemRow> items, String role, Instant now, Details details) {
        boolean seesSellerMoney = !BUYER.equals(role);
        OrderResponse.Amounts amounts = new OrderResponse.Amounts(vnd(o.subtotal()), vnd(o.shippingFee()), vnd(o.totalAmount()),
                seesSellerMoney ? o.commissionRate().stripTrailingZeros() : null,
                seesSellerMoney ? vnd(o.commissionAmount()) : null,
                seesSellerMoney ? vnd(o.sellerProceeds()) : null,
                seesSellerMoney ? vnd(o.sellerPayoutTotal()) : null);
        boolean seesDelivery = !SELLER.equals(role) || sellerNeedsDeliveryDetails(o.status());
        OrderResponse.Delivery delivery = seesDelivery
                ? new OrderResponse.Delivery(o.recipientName(), o.recipientPhone(), o.deliveryAddress()) : null;
        List<OrderResponse.Item> itemDtos = items.stream()
                .map(i -> new OrderResponse.Item(i.productId(), i.title(), vnd(i.unitPrice()), i.quantity(), ProductMapper.publicUrl(i.imageUrl())))
                .toList();

        OrderResponse.Shipment shipment = null;
        List<OrderResponse.Payment> payments = null;
        List<OrderResponse.HistoryEntry> history = null;
        List<OrderResponse.Dispute> disputes = null;
        OrderResponse.Settlement settlement = null;
        if (details != null) {
            shipment = details.shipment() == null ? null : new OrderResponse.Shipment(details.shipment().carrier(),
                    details.shipment().trackingNumber(), details.shipment().shippedAt(), details.shipment().receivedAt());
            if (!SELLER.equals(role)) {
                payments = details.payments().stream().map(p -> new OrderResponse.Payment(p.id(), OrderValues.provider(p.provider()),
                        OrderValues.upper(p.status()), vnd(p.amount()), p.sandbox(), p.createdAt(), p.finishedAt())).toList();
            }
            history = details.history().stream().map(h -> new OrderResponse.HistoryEntry(OrderValues.orderStatus(h.status()),
                    actorOf(h.changedBy(), o), h.note(), h.changedAt())).toList();
            disputes = details.disputes().stream().map(d -> new OrderResponse.Dispute(d.id(), actorOf(d.openedBy(), o), d.reason(),
                    OrderValues.upper(d.status()), OrderValues.upper(d.decision()), d.resolution(), d.refundConfirmed(), d.createdAt(),
                    d.resolvedAt())).toList();
            if (seesSellerMoney && details.settlement() != null) {
                OrderQueries.SettlementRow s = details.settlement();
                settlement = new OrderResponse.Settlement(OrderValues.upper(s.status()), vnd(s.amount()), vnd(s.merchandiseSubtotal()),
                        vnd(s.commission()), vnd(s.shippingFee()), s.sandbox(), s.createdAt(), s.releasedAt());
            }
        }

        return new OrderResponse(o.id(), OrderResponse.codeOf(o.id()), OrderValues.orderStatus(o.status()), role,
                new OrderResponse.Party(o.buyerId(), o.buyerName()), new OrderResponse.Party(o.sellerId(), o.sellerName()),
                itemDtos, amounts, OrderValues.provider(o.paymentProvider()), delivery,
                new OrderResponse.Deadlines(o.confirmBy(), o.paymentDueAt()),
                new OrderResponse.Timestamps(o.createdAt(), o.confirmedAt(), o.paidAt(), o.shippedAt(), o.completedAt(), o.cancelledAt()),
                o.cancellationReason(), shipment, payments, history, disputes, settlement, actions(o, role, now));
    }

    /**
     * Buttons the viewer may show now. Only a hint: every action is checked again by the server and the procedures.
     * CONFIRM, CANCEL, PAY, CONTINUE_PAYMENT, SHIP, CONFIRM_RECEIPT, OPEN_DISPUTE.
     */
    static List<String> actions(OrderQueries.OrderRow o, String role, Instant now) {
        List<String> actions = new ArrayList<>();
        boolean buyer = BUYER.equals(role);
        boolean seller = SELLER.equals(role);
        switch (o.status()) {
            case OrderValues.PENDING -> {
                if (seller && now.isBefore(o.confirmBy())) {
                    actions.add("CONFIRM");
                }
                if (buyer || seller) {
                    actions.add("CANCEL");
                }
            }
            case OrderValues.AWAITING_PAYMENT -> {
                if (buyer && o.hasPendingPayment()) {
                    actions.add("CONTINUE_PAYMENT");
                } else if (buyer && o.paymentDueAt() != null && now.isBefore(o.paymentDueAt())) {
                    actions.add("PAY");
                }
                if ((buyer || seller) && !o.hasPendingPayment()) {
                    actions.add("CANCEL");
                }
            }
            case OrderValues.PAID -> {
                if (seller) {
                    actions.add("SHIP");
                }
            }
            case OrderValues.DELIVERING -> {
                if (buyer && !o.hasOpenDispute()) {
                    actions.add("CONFIRM_RECEIPT");
                }
            }
            default -> {
            }
        }
        boolean paid = OrderValues.PAID.equals(o.status()) || OrderValues.DELIVERING.equals(o.status()) || OrderValues.COMPLETED.equals(o.status());
        if ((buyer || seller) && paid && !o.hasOpenDispute() && !"Released".equals(o.settlementStatus())) {
            actions.add("OPEN_DISPUTE");
        }
        return actions;
    }

    /**
     * The seller gets the recipient's name, phone and address only while they are needed to deliver: after the
     * verified online payment (PAID) and during delivery (DELIVERING). Business Plan 3.2 / 6.5: the seller arranges
     * delivery after successful online payment; confirming availability (PENDING) does not need them. Not before
     * payment, and not after the order is completed or cancelled.
     */
    static boolean sellerNeedsDeliveryDetails(String sqlStatus) {
        return OrderValues.PAID.equals(sqlStatus) || OrderValues.DELIVERING.equals(sqlStatus);
    }

    /** User id in the history / disputes → BUYER, SELLER, ADMIN; no user (expiry job, payment provider) → SYSTEM. */
    private static String actorOf(Integer userId, OrderQueries.OrderRow o) {
        if (userId == null) {
            return "SYSTEM";
        }
        if (userId == o.buyerId()) {
            return BUYER;
        }
        return userId == o.sellerId() ? SELLER : ADMIN;
    }

    static long vnd(BigDecimal amount) {
        return amount == null ? 0 : amount.longValueExact();
    }

    /** Detail-only parts. */
    record Details(OrderQueries.ShipmentRow shipment, List<OrderQueries.PaymentRow> payments, List<OrderQueries.HistoryRow> history,
                   List<OrderQueries.DisputeRow> disputes, OrderQueries.SettlementRow settlement) {
    }
}
