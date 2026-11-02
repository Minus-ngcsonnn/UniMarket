package com.unimarket.service.order;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.PaymentResponses;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * Starts payment attempts for the buyer ({@code usp_StartPayment}).
 *
 * <p>Starting a payment never marks anything paid: the order becomes Paid only when a VERIFIED provider result is
 * recorded ({@link PaymentResultService}). The amount is the order's {@code TotalAmount}, taken by the procedure
 * from the database. In the MVP no real payment provider is connected, so every attempt is recorded as a sandbox
 * (simulated) attempt ({@code Payments.IsSandbox = 1}).</p>
 */
@Service
@Profile("!nodb")
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    /** No real provider integration exists (MVP); every attempt is a simulation. */
    static final boolean SANDBOX = true;

    private final OrderService orders;
    private final OrderQueries queries;
    private final OrderProcedures procedures;
    private final boolean simulatorEnabled;

    public PaymentService(OrderService orders, OrderQueries queries, OrderProcedures procedures,
                          @Value("${unimarket.payment.simulator.enabled}") boolean simulatorEnabled) {
        this.orders = orders;
        this.queries = queries;
        this.procedures = procedures;
        this.simulatorEnabled = simulatorEnabled;
    }

    /**
     * Starts (or resumes) the payment of an AwaitingPayment order, before its payment deadline.
     * If an attempt is already in progress it is returned again ({@code resumed = true}); V002 allows one pending
     * attempt per order.
     *
     * @param providerApi MOMO or ZALOPAY; may be null when it was chosen at checkout
     */
    public PaymentResponses.PaymentAttempt start(long orderId, String providerApi, AuthenticatedUser buyer) {
        OrderQueries.OrderRow order = orders.requireSide(orderId, buyer, OrderMapper.BUYER);
        String provider = null;
        if (providerApi != null && !providerApi.isBlank()) {
            provider = OrderValues.providerSql(providerApi).orElseThrow(PaymentService::invalidProvider);
        }
        Optional<OrderQueries.PaymentRow> inProgress = pending(orderId);
        if (inProgress.isPresent()) {
            return attempt(inProgress.get(), order, true);
        }
        String requestKey = "UMK-" + HexFormat.of().formatHex(randomBytes());
        try {
            long paymentId = procedures.startPayment(orderId, buyer.id(), requestKey, SANDBOX, provider);
            log.info("Payment attempt {} started for order {} (sandbox)", paymentId, orderId);
        } catch (DataAccessException ex) {
            if (SqlErrors.isDuplicateKey(ex)) {            // another attempt was started at the same moment
                return pending(orderId).map(p -> attempt(p, order, true)).orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_IN_PROGRESS));
            }
            throw switch (SqlErrors.numberOf(ex)) {
                case 51008 -> new ApiException(ErrorCode.ORDER_STATE_CONFLICT, "Only an order awaiting payment can be paid.");
                case 51024 -> new ApiException(ErrorCode.ORDER_DEADLINE_PASSED, "The 24-hour payment deadline has passed.");
                case 51023 -> invalidProvider();
                default -> ex;
            };
        }
        OrderQueries.PaymentRow created = queries.paymentByRequestKey(requestKey).orElseThrow();
        return attempt(created, order, false);
    }

    private Optional<OrderQueries.PaymentRow> pending(long orderId) {
        return queries.payments(orderId).stream().filter(p -> "Pending".equals(p.status())).findFirst();
    }

    private PaymentResponses.PaymentAttempt attempt(OrderQueries.PaymentRow p, OrderQueries.OrderRow order, boolean resumed) {
        String simulatorUrl = simulatorEnabled && p.sandbox() ? "/api/dev/payment-simulator/payments/" + p.id() + "/complete" : null;
        return new PaymentResponses.PaymentAttempt(p.id(), p.orderId(), OrderValues.provider(p.provider()), OrderMapper.vnd(p.amount()),
                OrderValues.upper(p.status()), p.sandbox(), resumed, p.createdAt(), order.paymentDueAt(), simulatorUrl);
    }

    private static ValidationException invalidProvider() {
        return new ValidationException(List.of(new ApiErrorResponse.FieldError("provider", "must be MOMO or ZALOPAY")));
    }

    private static byte[] randomBytes() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return bytes;
    }
}
