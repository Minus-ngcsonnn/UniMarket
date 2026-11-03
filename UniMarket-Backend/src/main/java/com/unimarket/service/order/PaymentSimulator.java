package com.unimarket.service.order;

import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.security.SecretKeys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

/**
 * SANDBOX PAYMENT SIMULATOR (development and tests only; {@code unimarket.payment.simulator.enabled}).
 * No payment provider is contacted and no money moves.
 *
 * <p>It plays the role of a payment provider: the buyer "pays" on the simulator, and the simulator sends a
 * provider-style notification signed with HMAC-SHA256 ({@code PAYMENT_SIMULATOR_SECRET}). The notification goes
 * through signature verification and {@link PaymentResultService}, exactly like a real provider callback would. The
 * amount and the attempt come from the database, never from the client; the buyer only chooses the simulated
 * outcome (success or failure), as on a provider's sandbox page. It only touches sandbox attempts.</p>
 */
@Service
@Profile("!nodb")
@ConditionalOnProperty(name = "unimarket.payment.simulator.enabled", havingValue = "true")
public class PaymentSimulator {

    private static final Logger log = LoggerFactory.getLogger(PaymentSimulator.class);
    private static final String ALGORITHM = "HmacSHA256";

    private final OrderService orders;
    private final OrderQueries queries;
    private final PaymentResultService results;
    private final SecretKeySpec key;
    private com.unimarket.service.promotion.PromotionService promotions;

    /** Promotion payments (Stage 5) are simulated by the same signed-notification path. */
    @org.springframework.beans.factory.annotation.Autowired
    void setPromotions(com.unimarket.service.promotion.PromotionService promotions) {
        this.promotions = promotions;
    }

    /**
     * The seller finishes a pending sandbox PROMOTION payment on the simulator. Same model as orders: the notification
     * is built from the database (request key, stored amount), signed, verified and recorded.
     */
    public com.unimarket.dto.promotion.PromotionDtos.Promotion completePromotion(long promotionId, boolean success, AuthenticatedUser seller) {
        com.unimarket.dto.promotion.PromotionDtos.Promotion promotion = promotions.forSeller(promotionId, seller);
        if (!promotion.sandbox()) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Promotion not found.");
        }
        if (!"PENDING".equals(promotion.status())) {
            throw new ApiException(ErrorCode.CONFLICT, "This promotion payment has already finished.");
        }
        PaymentResultService.PaymentNotification notification = new PaymentResultService.PaymentNotification(
                promotions.requestKeyOf(promotionId), "SIM-" + UUID.randomUUID().toString().replace("-", ""), promotion.amount(), success,
                promotion.provider());
        receive(notification, sign(notification));
        return promotions.forSeller(promotionId, seller);
    }

    public PaymentSimulator(OrderService orders, OrderQueries queries, PaymentResultService results,
                            @Value("${unimarket.payment.simulator.secret:}") String secret,
                            @Value("${unimarket.payment.simulator.allow-ephemeral-secret:false}") boolean allowEphemeral,
                            org.springframework.core.env.Environment environment) {
        if (environment.matchesProfiles("prod | production")) {
            throw new IllegalStateException("The sandbox payment simulator must not be enabled in a production profile "
                    + "(unset PAYMENT_SIMULATOR_ENABLED).");
        }
        this.orders = orders;
        this.queries = queries;
        this.results = results;
        this.key = new SecretKeySpec(SecretKeys.load(secret, "PAYMENT_SIMULATOR_SECRET", allowEphemeral), ALGORITHM);
        log.warn("Payment SIMULATOR is enabled: payments are simulated, no money moves. Never enable it in production.");
    }

    /**
     * The buyer finishes a pending sandbox attempt on the simulator.
     *
     * @param success simulated provider outcome
     * @return the order afterwards
     */
    public OrderResponse complete(long paymentId, boolean success, AuthenticatedUser buyer) {
        OrderQueries.PaymentRow payment = queries.payment(paymentId).orElseThrow(OrderService::notFound);
        orders.requireSide(payment.orderId(), buyer, OrderMapper.BUYER);
        if (!payment.sandbox()) {
            throw OrderService.notFound();
        }
        if (!"Pending".equals(payment.status())) {
            throw new ApiException(ErrorCode.ORDER_STATE_CONFLICT, "This payment has already finished.");
        }
        PaymentResultService.PaymentNotification notification = new PaymentResultService.PaymentNotification(payment.requestKey(),
                "SIM-" + UUID.randomUUID().toString().replace("-", ""), OrderMapper.vnd(payment.amount()), success,
                OrderValues.provider(payment.provider()));
        receive(notification, sign(notification));
        return orders.detail(payment.orderId(), buyer);
    }

    /**
     * Provider → server notification of the simulator: verified with the HMAC signature, then recorded.
     *
     * @throws ApiException 401 PAYMENT_SIGNATURE_INVALID when the signature is missing or wrong
     */
    public com.unimarket.dto.order.PaymentResponses.CallbackResult receive(PaymentResultService.PaymentNotification notification, String signature) {
        if (!verify(notification, signature)) {
            log.warn("Simulated payment notification with an invalid signature was refused");
            throw new ApiException(ErrorCode.PAYMENT_SIGNATURE_INVALID);
        }
        if (queries.paymentByRequestKey(notification.requestKey()).isEmpty() && promotions != null
                && promotions.idForRequestKey(notification.requestKey()).isPresent()) {
            return promotions.recordPayment(notification, true);
        }
        return results.record(notification, true);
    }

    /** @return lowercase hex HMAC-SHA256 of {@link PaymentResultService.PaymentNotification#canonical()} */
    public String sign(PaymentResultService.PaymentNotification notification) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            return HexFormat.of().formatHex(mac.doFinal(notification.canonical().getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA256 is not available", ex);
        }
    }

    private boolean verify(PaymentResultService.PaymentNotification notification, String signature) {
        if (signature == null || notification.requestKey() == null || notification.providerReference() == null
                || notification.provider() == null) {
            return false;
        }
        byte[] expected = sign(notification).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, signature.trim().toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII));
    }
}
