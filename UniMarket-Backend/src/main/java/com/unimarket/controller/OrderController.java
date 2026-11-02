package com.unimarket.controller;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.dto.order.OrderRequests;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.dto.order.PaymentResponses;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.CheckoutService;
import com.unimarket.service.order.OrderService;
import com.unimarket.service.order.PaymentService;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Checkout, order history, order details and order actions (token required). See {@code docs/ORDERS_API.md}.
 * There is deliberately no endpoint that marks an order paid: only a verified provider result can.
 */
@RestController
@Profile("!nodb")
public class OrderController {

    private static final int MAX_PAGE_SIZE = 50;

    private final CheckoutService checkout;
    private final OrderService orders;
    private final PaymentService payments;

    public OrderController(CheckoutService checkout, OrderService orders, PaymentService payments) {
        this.checkout = checkout;
        this.orders = orders;
        this.payments = payments;
    }

    /** Places the order(s): one per seller, all or nothing. 201 with the created orders. */
    @PostMapping("/api/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    public CheckoutResponse checkout(@Valid @RequestBody OrderRequests.CheckoutRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        List<OrderResponse> created = checkout.checkout(request, user);
        long subtotal = created.stream().mapToLong(o -> o.amounts().subtotal()).sum();
        long fees = created.stream().mapToLong(o -> o.amounts().shippingFee()).sum();
        long total = created.stream().mapToLong(o -> o.amounts().total()).sum();
        return new CheckoutResponse(created, subtotal, fees, total, checkout.shippingFeePolicy());
    }

    /**
     * "My purchases" ({@code role=buyer}, default) or "My sales" ({@code role=seller}), newest first.
     * Optional {@code status} filter (repeatable or comma separated), 1-based {@code page}, {@code size} 1–50.
     */
    @GetMapping("/api/orders")
    public PageResponse<OrderResponse> list(@RequestParam(defaultValue = "buyer") String role,
                                            @RequestParam(name = "status", required = false) List<String> status,
                                            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
        List<ApiErrorResponse.FieldError> errors = new ArrayList<>();
        if (!role.equals("buyer") && !role.equals("seller")) errors.add(new ApiErrorResponse.FieldError("role", "must be buyer or seller"));
        if (page < 1) errors.add(new ApiErrorResponse.FieldError("page", "must be 1 or more"));
        if (size < 1 || size > MAX_PAGE_SIZE) errors.add(new ApiErrorResponse.FieldError("size", "must be between 1 and " + MAX_PAGE_SIZE));
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        List<String> statuses = status == null ? List.of()
                : status.stream().flatMap(s -> Arrays.stream(s.split(","))).map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        return orders.list(user, role.equals("seller"), statuses, page, size);
    }

    /** Several orders the viewer takes part in (e.g. the order confirmation page after checkout). */
    @GetMapping("/api/orders/by-ids")
    public List<OrderResponse> byIds(@RequestParam List<Long> ids, @AuthenticationPrincipal AuthenticatedUser user) {
        if (ids.isEmpty() || ids.size() > MAX_PAGE_SIZE) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("ids", "must contain 1 to " + MAX_PAGE_SIZE + " ids")));
        }
        return orders.summaries(ids.stream().distinct().toList(), user);
    }

    /** {@code {buyer: n, seller: m}}: orders waiting for the viewer (header badge). */
    @GetMapping("/api/orders/action-counts")
    public Map<String, Long> actionCounts(@AuthenticationPrincipal AuthenticatedUser user) {
        return orders.actionCounts(user);
    }

    /** Order page with items, amounts, payments, delivery, history, disputes and settlement (as allowed). */
    @GetMapping("/api/orders/{id}")
    public OrderResponse detail(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return orders.detail(id, user);
    }

    /** Seller confirms availability (Pending → AwaitingPayment). */
    @PostMapping("/api/orders/{id}/confirm")
    public OrderResponse confirm(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return orders.confirm(id, user);
    }

    /** Buyer cancels or seller declines an unpaid order. */
    @PostMapping("/api/orders/{id}/cancel")
    public OrderResponse cancel(@PathVariable long id, @Valid @RequestBody(required = false) OrderRequests.CancelRequest request,
                                @AuthenticationPrincipal AuthenticatedUser user) {
        return orders.cancel(id, request == null ? null : request.reason(), user);
    }

    /** Seller hands a paid order to delivery (Paid → Delivering). */
    @PostMapping("/api/orders/{id}/ship")
    public OrderResponse ship(@PathVariable long id, @Valid @RequestBody(required = false) OrderRequests.ShipRequest request,
                              @AuthenticationPrincipal AuthenticatedUser user) {
        return orders.ship(id, request == null ? null : request.carrier(), request == null ? null : request.trackingNumber(), user);
    }

    /** Buyer confirms receipt (Delivering → Completed). */
    @PostMapping("/api/orders/{id}/confirm-receipt")
    public OrderResponse confirmReceipt(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return orders.confirmReceipt(id, user);
    }

    /** Buyer starts (201) or resumes (200) the online payment of a confirmed order. Does NOT mark it paid. */
    @PostMapping("/api/orders/{id}/payments")
    public ResponseEntity<PaymentResponses.PaymentAttempt> startPayment(@PathVariable long id,
                                                                        @RequestBody(required = false) OrderRequests.StartPaymentRequest request,
                                                                        @AuthenticationPrincipal AuthenticatedUser user) {
        PaymentResponses.PaymentAttempt attempt = payments.start(id, request == null ? null : request.provider(), user);
        return ResponseEntity.status(attempt.resumed() ? HttpStatus.OK : HttpStatus.CREATED).body(attempt);
    }

    /** Buyer or seller of a paid order asks an admin to review a problem (D3). 201 with the order. */
    @PostMapping("/api/orders/{id}/disputes")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse openDispute(@PathVariable long id, @Valid @RequestBody OrderRequests.DisputeRequest request,
                                     @AuthenticationPrincipal AuthenticatedUser user) {
        return orders.openDispute(id, request.reason(), user);
    }

    /**
     * @param orders      the created orders, one per seller (each with its own delivery fee and total)
     * @param subtotal    merchandise total of all orders
     * @param shippingFee sum of the delivery fees
     * @param total       what the buyer pays for all orders (each order is paid separately)
     * @param shippingFeePolicy how the delivery fee was determined (provisional)
     */
    public record CheckoutResponse(List<OrderResponse> orders, long subtotal, long shippingFee, long total,
                                   com.unimarket.dto.order.CartResponse.ShippingFeePolicy shippingFeePolicy) {
    }
}
