package com.unimarket.exception;

import com.unimarket.common.ErrorCode;

/**
 * Base exception for expected, client-facing errors (e.g. "listing not found").
 *
 * <p>Services throw it (or a subclass); {@link GlobalExceptionHandler} turns it into an
 * {@link com.unimarket.common.ApiErrorResponse} with the code's HTTP status. The message
 * is sent to the client, so it must never contain internal details.</p>
 */
public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;

    /**
     * Creates an exception with the code's default message.
     *
     * @param errorCode error code and HTTP status
     */
    public ApiException(ErrorCode errorCode) {
        this(errorCode, errorCode.defaultMessage());
    }

    /**
     * Creates an exception with a client-safe message.
     *
     * @param errorCode error code and HTTP status
     * @param message   message shown to the client
     */
    public ApiException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    /** @return the error code (and HTTP status) of this exception */
    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
