package com.unimarket.service.order;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.entity.UserRole;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Order history, order details and the participants' order actions. Every state change is one V002 procedure
 * call; this service checks who may act (404 for strangers, 403 for the wrong side) and translates procedure
 * errors into API error codes.
 */
@Service
@Profile("!nodb")
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final OrderQueries queries;
    private final OrderProcedures procedures;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final Clock clock;

    public OrderService(OrderQueries queries, OrderProcedures procedures, JdbcTemplate jdbc,
                        PlatformTransactionManager transactionManager, Clock clock) {
        this.queries = queries;
        this.procedures = procedures;
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    // ------------------------------------------------------------------ reading

    /**
     * The viewer's orders as buyer ("My purchases") or seller ("My sales"), newest first.
     *
     * @param asSeller   true for sales
     * @param apiStatuses optional status filter (API values)
     */
    public PageResponse<OrderResponse> list(AuthenticatedUser viewer, boolean asSeller, List<String> apiStatuses, int page, int size) {
        List<String> sqlStatuses = new ArrayList<>();
        for (String status : apiStatuses) {
            sqlStatuses.add(OrderValues.orderStatusSql(status).orElseThrow(() -> new ValidationException(List.of(
                    new ApiErrorResponse.FieldError("status", "must be PENDING, AWAITING_PAYMENT, PAID, DELIVERING, COMPLETED or CANCELLED")))));
        }
        long total = queries.countOrdersOf(viewer.id(), asSeller, sqlStatuses);
        List<OrderQueries.OrderRow> rows = queries.ordersOf(viewer.id(), asSeller, sqlStatuses, (page - 1) * size, size);
        return new PageResponse<>(summaries(rows, viewer), page, size, total, (int) ((total + size - 1) / size), null);
    }

    /** Orders by id that the viewer takes part in (others are left out), e.g. after checkout. */
    public List<OrderResponse> summaries(Collection<Long> orderIds, AuthenticatedUser viewer) {
        List<OrderQueries.OrderRow> rows = queries.orders(orderIds).stream().filter(o -> roleOf(o, viewer) != null).toList();
        return summaries(rows, viewer);
    }

    private List<OrderResponse> summaries(List<OrderQueries.OrderRow> rows, AuthenticatedUser viewer) {
        Map<Long, List<OrderQueries.ItemRow>> items = queries.items(rows.stream().map(OrderQueries.OrderRow::id).toList());
        Instant now = clock.instant();
        return rows.stream().map(o -> OrderMapper.summary(o, items.getOrDefault(o.id(), List.of()), roleOf(o, viewer), now)).toList();
    }

    /** Full order page for its buyer, its seller or an admin; 404 for anyone else. */
    public OrderResponse detail(long orderId, AuthenticatedUser viewer) {
        OrderQueries.OrderRow order = visibleOrder(orderId, viewer);
        OrderMapper.Details details = new OrderMapper.Details(queries.shipment(orderId).orElse(null), queries.payments(orderId),
                queries.history(orderId), queries.disputes(orderId), queries.settlement(orderId).orElse(null));
        return OrderMapper.detail(order, queries.items(List.of(orderId)).getOrDefault(orderId, List.of()), roleOf(order, viewer),
                clock.instant(), details);
    }

    /** Number of orders waiting for the viewer: {@code {buyer: n, seller: m}} (header badge). */
    public Map<String, Long> actionCounts(AuthenticatedUser viewer) {
        return queries.actionCounts(viewer.id());
    }

    // ------------------------------------------------------------------ actions

    /** Seller confirms availability (within 24 h of the order); the buyer's 24-hour payment window starts. */
    public OrderResponse confirm(long orderId, AuthenticatedUser viewer) {
        OrderQueries.OrderRow order = requireSide(orderId, viewer, OrderMapper.SELLER);
        try {
            procedures.confirm(orderId, viewer.id());
        } catch (DataAccessException ex) {
            if (SqlErrors.numberOf(ex) == 51007) {
                boolean late = OrderValues.PENDING.equals(order.status()) && !clock.instant().isBefore(order.confirmBy());
                throw late ? new ApiException(ErrorCode.ORDER_DEADLINE_PASSED, "The 24-hour confirmation deadline has passed.")
                        : new ApiException(ErrorCode.ORDER_STATE_CONFLICT);
            }
            throw ex;
        }
        log.info("Order {} confirmed by seller {}", orderId, viewer.id());
        return detail(orderId, viewer);
    }

    /**
     * Buyer cancels, or seller declines, an unpaid order (Pending or AwaitingPayment). Every listing is released.
     * Paid orders cannot be cancelled: they need a dispute (D3).
     */
    public OrderResponse cancel(long orderId, String reason, AuthenticatedUser viewer) {
        OrderQueries.OrderRow order = requireParticipant(orderId, viewer);
        String role = roleOf(order, viewer);
        String note = reason == null || reason.isBlank()
                ? (OrderMapper.SELLER.equals(role) ? "Declined by the seller" : "Cancelled by the buyer") : reason.trim();
        try {
            procedures.cancel(orderId, viewer.id(), note);
        } catch (DataAccessException ex) {
            throw switch (SqlErrors.numberOf(ex)) {
                case 51018 -> new ApiException(ErrorCode.ORDER_STATE_CONFLICT, "Only an unpaid order can be cancelled. For a paid order, open a dispute.");
                case 51019 -> new ApiException(ErrorCode.PAYMENT_IN_PROGRESS, "A payment for this order is in progress. Finish or cancel it first.");
                default -> ex;
            };
        }
        log.info("Order {} cancelled by {} {}", orderId, role, viewer.id());
        return detail(orderId, viewer);
    }

    /** Seller marks a paid order as handed to delivery (courier and tracking number optional). */
    public OrderResponse ship(long orderId, String carrier, String trackingNumber, AuthenticatedUser viewer) {
        requireSide(orderId, viewer, OrderMapper.SELLER);
        try {
            procedures.ship(orderId, viewer.id(), blankToNull(carrier), blankToNull(trackingNumber));
        } catch (DataAccessException ex) {
            if (SqlErrors.numberOf(ex) == 51014) {
                throw new ApiException(ErrorCode.ORDER_STATE_CONFLICT, "Only a paid order can be shipped.");
            }
            throw ex;
        }
        log.info("Order {} shipped by seller {}", orderId, viewer.id());
        return detail(orderId, viewer);
    }

    /**
     * Buyer confirms receipt: the order is completed, its listings become Sold and ONE seller settlement is
     * calculated (Pending; an admin confirms the real payout later, D6).
     *
     * <p>Not while a dispute is open: the order row is locked (the same lock {@code usp_OpenOrderDispute} takes),
     * the open dispute is checked, then {@code usp_CompleteOrder} runs in the same transaction.</p>
     */
    public OrderResponse confirmReceipt(long orderId, AuthenticatedUser viewer) {
        requireSide(orderId, viewer, OrderMapper.BUYER);
        try {
            transaction.executeWithoutResult(status -> {
                jdbc.queryForList("SELECT OrderId FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE OrderId = ?", Long.class, orderId);
                Integer open = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderDisputes WHERE OrderId = ? AND Status = 'Open'", Integer.class, orderId);
                if (open != null && open > 0) {
                    throw new ApiException(ErrorCode.ORDER_DISPUTED);
                }
                procedures.complete(orderId, viewer.id());
            });
        } catch (DataAccessException ex) {
            if (SqlErrors.numberOf(ex) == 51015 || SqlErrors.numberOf(ex) == 51016) {
                throw new ApiException(ErrorCode.ORDER_STATE_CONFLICT, "Only an order that is being delivered can be confirmed as received.");
            }
            throw ex;
        }
        log.info("Order {} completed by buyer {}", orderId, viewer.id());
        return detail(orderId, viewer);
    }

    /**
     * Buyer or seller of a paid order asks an admin to review a problem (D3). Nothing else changes; the seller payout
     * is put on hold. Refunds are decided and made manually by an admin (later Admin stage).
     */
    public OrderResponse openDispute(long orderId, String reason, AuthenticatedUser viewer) {
        requireParticipant(orderId, viewer);
        try {
            long disputeId = procedures.openDispute(orderId, viewer.id(), reason.trim());
            log.info("Dispute {} opened on order {} by user {}", disputeId, orderId, viewer.id());
        } catch (DataAccessException ex) {
            throw switch (SqlErrors.numberOf(ex)) {
                case 51030 -> new ApiException(ErrorCode.DISPUTE_NOT_ALLOWED, "A dispute can only be opened for a paid order.");
                case 51031 -> new ValidationException(List.of(new ApiErrorResponse.FieldError("reason", "must not be blank")));
                case 51032 -> new ApiException(ErrorCode.ORDER_DISPUTED, "This order already has an open dispute.");
                case 51033 -> new ApiException(ErrorCode.DISPUTE_NOT_ALLOWED, "The seller has already been paid for this order; contact support.");
                default -> SqlErrors.isDuplicateKey(ex) ? new ApiException(ErrorCode.ORDER_DISPUTED, "This order already has an open dispute.") : ex;
            };
        }
        return detail(orderId, viewer);
    }

    // ------------------------------------------------------------------ access

    /** The order if the viewer is its buyer, its seller or an admin; otherwise 404 (no information leak). */
    OrderQueries.OrderRow visibleOrder(long orderId, AuthenticatedUser viewer) {
        OrderQueries.OrderRow order = queries.order(orderId).orElseThrow(OrderService::notFound);
        if (roleOf(order, viewer) == null) {
            throw notFound();
        }
        return order;
    }

    /** The order if the viewer is its buyer or seller (admins act in the later Admin stage). */
    OrderQueries.OrderRow requireParticipant(long orderId, AuthenticatedUser viewer) {
        OrderQueries.OrderRow order = visibleOrder(orderId, viewer);
        if (viewer.id() != order.buyerId() && viewer.id() != order.sellerId()) {
            throw new ApiException(ErrorCode.ACCESS_DENIED);
        }
        return order;
    }

    /** The order if the viewer is on the given side (BUYER or SELLER); 403 for the other side. */
    OrderQueries.OrderRow requireSide(long orderId, AuthenticatedUser viewer, String side) {
        OrderQueries.OrderRow order = requireParticipant(orderId, viewer);
        int expected = OrderMapper.BUYER.equals(side) ? order.buyerId() : order.sellerId();
        if (viewer.id() != expected) {
            throw new ApiException(ErrorCode.ACCESS_DENIED, OrderMapper.BUYER.equals(side)
                    ? "Only the buyer can do this." : "Only the seller can do this.");
        }
        return order;
    }

    /** BUYER, SELLER, ADMIN or null when the viewer has no access. */
    static String roleOf(OrderQueries.OrderRow order, AuthenticatedUser viewer) {
        if (viewer.id() == order.buyerId()) {
            return OrderMapper.BUYER;
        }
        if (viewer.id() == order.sellerId()) {
            return OrderMapper.SELLER;
        }
        return viewer.role() == UserRole.ADMIN ? OrderMapper.ADMIN : null;
    }

    static ApiException notFound() {
        return new ApiException(ErrorCode.NOT_FOUND, "Order not found.");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
