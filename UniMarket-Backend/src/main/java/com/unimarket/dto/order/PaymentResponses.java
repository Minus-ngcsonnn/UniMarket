package com.unimarket.dto.order;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/** Payment responses. */
public final class PaymentResponses {

    private PaymentResponses() {
    }

    /**
     * A payment attempt started by the buyer.
     *
     * @param paymentId    {@code Payments.PaymentId}; used by the sandbox simulator
     * @param orderId      order being paid
     * @param provider     MOMO or ZALOPAY
     * @param amount       order total (merchandise + delivery fee), set by the database
     * @param status       PENDING, SUCCEEDED, FAILED, EXPIRED
     * @param sandbox      true: simulated payment, no real money (always true in the MVP)
     * @param resumed      true when an attempt was already in progress and is returned again
     * @param paymentDueAt the buyer's payment deadline (UTC)
     * @param simulatorUrl where the sandbox simulator finishes this attempt (only when the simulator is enabled)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PaymentAttempt(long paymentId, long orderId, String provider, long amount, String status, boolean sandbox,
                                 boolean resumed, Instant createdAt, Instant paymentDueAt, String simulatorUrl) {
    }

    /**
     * Result of processing a (simulated) provider notification.
     *
     * @param outcome       RECORDED or DUPLICATE_IGNORED
     * @param paymentStatus payment attempt status afterwards
     * @param orderStatus   order status afterwards
     */
    public record CallbackResult(String outcome, String paymentStatus, String orderStatus) {
    }
}
