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
     * @param provider     MOMO, ZALOPAY or BANK_QR
     * @param amount       order total (merchandise + delivery fee), set by the database
     * @param status       PENDING, SUCCEEDED, FAILED, EXPIRED
     * @param sandbox      true: simulated payment, no real money (always true in the MVP)
     * @param resumed      true when an attempt was already in progress and is returned again
     * @param paymentDueAt the buyer's payment deadline (UTC)
     * @param simulatorUrl where the sandbox simulator finishes this attempt (only when the simulator is enabled)
     * @param bankQr       only for BANK_QR: the DEMO QR content and reference to display (not payable)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PaymentAttempt(long paymentId, long orderId, String provider, long amount, String status, boolean sandbox,
                                 boolean resumed, Instant createdAt, Instant paymentDueAt, String simulatorUrl, BankQrDemo bankQr) {
    }

    /**
     * Simulated bank-transfer QR (V003). The payload is deliberately NOT an EMVCo / VietQR string and names no real bank or
     * account, so no banking app can pay it. The order becomes Paid only after the server verifies a signed simulator
     * result; showing or scanning this QR changes nothing.
     *
     * @param qrPayload  text to render as a QR image, e.g. {@code UNIMARKET-SIMULATED-PAYMENT|ref=...|amount=...|NOT-A-BANK-QR}
     * @param reference  demo transfer reference shown under the QR
     * @param amount     exact amount of the attempt (VND), from the database
     * @param simulated  always true
     * @param notice     label the UI must show next to the QR
     */
    public record BankQrDemo(String qrPayload, String reference, long amount, boolean simulated, String notice) {

        public static final String NOTICE = "SIMULATED bank QR for the UniMarket academic demo. Not a real bank account; "
                + "do not transfer money. Payment is confirmed only by the UniMarket server (sandbox).";

        /** @return the demo QR of one payment attempt */
        public static BankQrDemo of(long orderId, long paymentId, long amount) {
            String reference = "UMDEMO-" + orderId + "-" + paymentId;
            return new BankQrDemo("UNIMARKET-SIMULATED-PAYMENT|ref=" + reference + "|amount=" + amount + "|NOT-A-BANK-QR",
                    reference, amount, true, NOTICE);
        }
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
