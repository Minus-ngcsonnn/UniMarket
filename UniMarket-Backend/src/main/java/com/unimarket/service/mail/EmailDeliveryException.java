package com.unimarket.service.mail;

/**
 * The e-mail provider did not accept a message. The message never contains secrets, codes or the API key.
 */
public class EmailDeliveryException extends RuntimeException {

    /** Why the provider refused (used for logs and tests; clients only see a generic message). */
    public enum Reason {
        /** API key missing, invalid or without sending permission (HTTP 401 / 403 key errors). */
        INVALID_CREDENTIALS,
        /** Sender domain not verified, or the testing sender used for a recipient other than the account owner (403). */
        SENDER_NOT_ALLOWED,
        /** Request rejected as invalid (400 / 422), e.g. a malformed address. */
        INVALID_REQUEST,
        /** Provider rate limit or daily quota (429). */
        RATE_LIMITED,
        /** Provider error (5xx) or unexpected answer. */
        PROVIDER_ERROR,
        /** No answer within the configured timeout. */
        TIMEOUT,
        /** Connection failure (DNS, TLS, network). */
        NETWORK
    }

    private final Reason reason;
    private final int status;

    public EmailDeliveryException(Reason reason, int status, String message) {
        super(message);
        this.reason = reason;
        this.status = status;
    }

    public EmailDeliveryException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
        this.status = 0;
    }

    public Reason reason() {
        return reason;
    }

    /** @return provider HTTP status, or 0 when there was no answer */
    public int status() {
        return status;
    }
}
