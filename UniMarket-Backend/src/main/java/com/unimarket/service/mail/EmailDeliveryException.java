package com.unimarket.service.mail;

/**
 * The mail server did not accept a message. The message never contains credentials or verification codes.
 */
public class EmailDeliveryException extends RuntimeException {

    /** Why the message was not accepted (used for logs and tests; clients only see a generic message). */
    public enum Reason {
        /** Wrong or missing credentials, e.g. an invalid Google App Password (SMTP 530 / 534 / 535). */
        INVALID_CREDENTIALS,
        /** The sender address is not allowed for the authenticated account. */
        SENDER_NOT_ALLOWED,
        /** Recipient or message rejected (SMTP 550 / 553 / 501 …). */
        INVALID_REQUEST,
        /** Provider sending limits (Gmail 4.7.x, daily quota 5.4.5, 452 / 454). */
        RATE_LIMITED,
        /** Service unavailable (e.g. 421) or another provider error. */
        PROVIDER_ERROR,
        /** No answer within the configured timeout. */
        TIMEOUT,
        /** Connection failure (DNS, TLS, refused). */
        NETWORK
    }

    private final Reason reason;
    private final int status;

    public EmailDeliveryException(Reason reason, int status, String message) {
        super(message);
        this.reason = reason;
        this.status = status;
    }

    public EmailDeliveryException(Reason reason, String message, Throwable cause, int status) {
        super(message, cause);
        this.reason = reason;
        this.status = status;
    }

    public Reason reason() {
        return reason;
    }

    /** @return the provider / SMTP status code, or 0 when there was no answer */
    public int status() {
        return status;
    }
}
