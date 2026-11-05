package com.unimarket.service.order;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.OrderRequests;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.dto.shipping.ShippingDtos;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.shipping.ShippingQuoteService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Checkout: one {@code usp_CheckoutWithShipping} call (V003, wrapping the unchanged V002 {@code usp_Checkout}) creates
 * one order per seller for the selected listings, each with its verified simulated shipping fee.
 *
 * <h2>Shipping (V003)</h2>
 * The client sends, per seller, a carrier and the signed quote token from {@code POST /api/shipping/quotes}; never an
 * amount. {@link ShippingQuoteService#verifyForCheckout} checks the token and recomputes the fee from the database
 * before the procedure is called; the procedure re-checks bounds, the free radius, one quote per seller order and the
 * pickup area.
 *
 * <h2>Atomicity</h2>
 * The whole checkout (all sellers) is ONE procedure call and therefore ONE database transaction (the outer one of
 * {@code usp_CheckoutWithShipping}; the nested V002 procedure joins it)
 * ({@code BEGIN TRANSACTION … COMMIT}, {@code XACT_ABORT ON}). If any listing is unavailable, belongs to the buyer,
 * or any insert fails, the procedure rolls everything back: no order, no item, no reservation, and the cart is
 * unchanged. The backend never calls the procedure once per seller and opens no outer transaction around it.
 *
 * <h2>Concurrency</h2>
 * The procedure reads the listings with {@code UPDLOCK, HOLDLOCK}; a second checkout of the same listing waits and
 * then fails (51021), and the unique index on {@code vw_ActiveOrderItems} is the final guard. Listing edits lock the
 * same row (Stage 3) and put the listing back to Pending moderation, which also makes it unavailable here.
 * A deadlock victim (1205) is retried once; that is safe because the failed attempt was fully rolled back.
 *
 * <h2>Repeated submissions</h2>
 * A repeated or concurrent identical submission cannot create a second order: its listings are already Reserved, so
 * it fails with 409 LISTING_UNAVAILABLE. It does not return the first result (no idempotency key in V002).
 */
@Service
@Profile("!nodb")
public class CheckoutService {

    private static final Logger log = LoggerFactory.getLogger(CheckoutService.class);

    private final OrderQueries queries;
    private final OrderProcedures procedures;
    private final OrderService orders;
    private final ShippingQuoteService shipping;

    public CheckoutService(OrderQueries queries, OrderProcedures procedures, OrderService orders, ShippingQuoteService shipping) {
        this.queries = queries;
        this.procedures = procedures;
        this.orders = orders;
        this.shipping = shipping;
    }

    /**
     * Simulated shipping options per seller for listings the buyer can check out now.
     *
     * @throws ApiException 400 VALIDATION_FAILED / INVALID_ZONE, 409 OWN_LISTING / LISTING_UNAVAILABLE
     */
    public ShippingDtos.QuoteResponse quote(ShippingDtos.QuoteRequest request, AuthenticatedUser buyer) {
        List<Integer> ids = request.productIds();
        if (new HashSet<>(ids).size() != ids.size()) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("productIds", "must not contain the same listing twice")));
        }
        checkListings(ids, null, buyer.id());
        return shipping.quote(buyer.id(), ids, request.deliveryZoneId());
    }

    /**
     * Places the orders.
     *
     * @return the created orders (one per seller), with item title and price snapshots
     * @throws ApiException 400 VALIDATION_FAILED / INVALID_ZONE / SHIPPING_QUOTE_INVALID, 409 OWN_LISTING,
     *                      LISTING_UNAVAILABLE, PRICE_CHANGED, SHIPPING_QUOTE_CHANGED, SHIPPING_UNAVAILABLE
     */
    public List<OrderResponse> checkout(OrderRequests.CheckoutRequest request, AuthenticatedUser buyer) {
        List<Integer> ids = request.productIds();
        if (new HashSet<>(ids).size() != ids.size()) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("productIds", "must not contain the same listing twice")));
        }
        String provider = null;
        if (request.paymentProvider() != null && !request.paymentProvider().isBlank()) {
            provider = OrderValues.providerSql(request.paymentProvider()).orElseThrow(() -> new ValidationException(List.of(
                    new ApiErrorResponse.FieldError("paymentProvider", "must be MOMO, ZALOPAY or BANK_QR"))));
        }
        checkListings(ids, request.expectedPrices(), buyer.id());
        List<ShippingQuoteService.ConfirmedShipping> confirmed =
                shipping.verifyForCheckout(buyer.id(), ids, request.deliveryZoneId(), request.shipping());

        String phone = request.recipientPhone().replaceAll("[\\s.-]", "");
        List<Long> created;
        try {
            created = placeWithDeadlockRetry(buyer.id(), ids, request.deliveryZoneId(), confirmed, request.recipientName().trim(), phone,
                    request.deliveryAddress().trim(), provider, request.deliveryLatitude(), request.deliveryLongitude());
        } catch (DataAccessException ex) {
            int number = SqlErrors.numberOf(ex);
            if (number == 51021 || SqlErrors.isDuplicateKey(ex)) {
                throw new ApiException(ErrorCode.LISTING_UNAVAILABLE);
            }
            throw switch (number) {
                case 51022 -> new ApiException(ErrorCode.OWN_LISTING);
                case 51004 -> new ApiException(ErrorCode.ACCESS_DENIED, "Your account cannot place orders.");
                case 51005, 51020 -> new ApiException(ErrorCode.VALIDATION_FAILED, "Delivery information and at least one listing are required.");
                case 51060 -> new ApiException(ErrorCode.INVALID_ZONE);
                // The listings changed between the quote check and the locked procedure checks (e.g. a pickup area edit).
                case 51061, 51062, 51063 -> new ApiException(ErrorCode.SHIPPING_QUOTE_CHANGED);
                default -> ex;
            };
        }
        log.info("Checkout by buyer {}: {} listing(s), orders {}", buyer.id(), ids.size(), created);
        return orders.summaries(created, buyer);
    }

    /** Clear errors before calling the procedure (the procedure checks everything again under its locks). */
    private void checkListings(List<Integer> ids, Map<Integer, Long> expectedPrices, int buyerId) {
        Map<Integer, OrderQueries.ListingRow> rows = queries.listings(ids);
        List<ApiErrorResponse.FieldError> unavailable = new ArrayList<>();
        List<ApiErrorResponse.FieldError> changed = new ArrayList<>();
        for (Integer id : ids) {
            OrderQueries.ListingRow row = rows.get(id);
            if (row == null || !(CartService.isPublic(row) || row.sellerId() == buyerId)) {
                unavailable.add(new ApiErrorResponse.FieldError("productIds[" + id + "]", "NOT_FOUND"));
                continue;
            }
            String reason = row.unavailableReason(buyerId);
            if ("OWN_LISTING".equals(reason)) {
                throw new ValidationException(ErrorCode.OWN_LISTING, ErrorCode.OWN_LISTING.defaultMessage(),
                        List.of(new ApiErrorResponse.FieldError("productIds[" + id + "]", reason)));
            }
            if (reason != null) {
                unavailable.add(new ApiErrorResponse.FieldError("productIds[" + id + "]", reason));
                continue;
            }
            Long expected = expectedPrices == null ? null : expectedPrices.get(id);
            long current = OrderMapper.vnd(row.price());
            if (expected != null && !Objects.equals(expected, current)) {
                changed.add(new ApiErrorResponse.FieldError("expectedPrices[" + id + "]", "price is now " + current));
            }
        }
        if (!unavailable.isEmpty()) {
            throw new ValidationException(ErrorCode.LISTING_UNAVAILABLE, ErrorCode.LISTING_UNAVAILABLE.defaultMessage(),
                    explainOwnOrders(unavailable, buyerId));
        }
        if (!changed.isEmpty()) {
            throw new ValidationException(ErrorCode.PRICE_CHANGED, ErrorCode.PRICE_CHANGED.defaultMessage(), changed);
        }
    }

    /**
     * A listing that is reserved or sold in an order of THIS buyer (typically a retried checkout whose first response
     * was lost) is reported as ALREADY_IN_YOUR_ORDER, plus an {@code existingOrderIds} entry, so the frontend can open
     * those orders instead of failing. This is not idempotency: the original response is not replayed.
     */
    private List<ApiErrorResponse.FieldError> explainOwnOrders(List<ApiErrorResponse.FieldError> unavailable, int buyerId) {
        java.util.Set<Integer> taken = new java.util.LinkedHashSet<>();
        for (ApiErrorResponse.FieldError error : unavailable) {
            if (!"NOT_FOUND".equals(error.message())) {
                taken.add(Integer.valueOf(error.field().replaceAll("\\D", "")));
            }
        }
        Map<Integer, Long> own = queries.activeOrdersOfBuyer(taken, buyerId);
        if (own.isEmpty()) {
            return unavailable;
        }
        List<ApiErrorResponse.FieldError> explained = new ArrayList<>();
        for (ApiErrorResponse.FieldError error : unavailable) {
            Integer id = Integer.valueOf(error.field().replaceAll("\\D", ""));
            explained.add(own.containsKey(id) ? new ApiErrorResponse.FieldError(error.field(), "ALREADY_IN_YOUR_ORDER") : error);
        }
        explained.add(new ApiErrorResponse.FieldError("existingOrderIds",
                own.values().stream().distinct().sorted().map(String::valueOf).collect(java.util.stream.Collectors.joining(","))));
        return explained;
    }

    private List<Long> placeWithDeadlockRetry(int buyerId, List<Integer> ids, int deliveryZoneId,
                                              List<ShippingQuoteService.ConfirmedShipping> confirmed, String name, String phone,
                                              String address, String provider, java.math.BigDecimal deliveryLatitude,
                                              java.math.BigDecimal deliveryLongitude) {
        try {
            return procedures.checkoutWithShipping(buyerId, ids, deliveryZoneId, confirmed, name, phone, address, provider, deliveryLatitude, deliveryLongitude);
        } catch (DataAccessException ex) {
            if (SqlErrors.numberOf(ex) != SqlErrors.DEADLOCK_VICTIM) {
                throw ex;
            }
            log.warn("Checkout of buyer {} was a deadlock victim (rolled back); retrying once", buyerId);
            return procedures.checkoutWithShipping(buyerId, ids, deliveryZoneId, confirmed, name, phone, address, provider, deliveryLatitude, deliveryLongitude);
        }
    }

    /** How the delivery fees of a checkout result were determined (V003 simulated quotes, included). */
    public com.unimarket.dto.order.CartResponse.ShippingFeePolicy shippingFeePolicy() {
        return com.unimarket.dto.order.CartResponse.ShippingFeePolicy.simulatedDistance(true);
    }
}
