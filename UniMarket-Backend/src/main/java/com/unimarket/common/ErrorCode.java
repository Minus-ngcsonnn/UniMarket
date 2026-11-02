package com.unimarket.common;

import org.springframework.http.HttpStatus;

/**
 * Stable error codes sent in {@link ApiErrorResponse#code()}.
 *
 * <p>The frontend can rely on these codes; the human-readable messages may change.
 * Feature-specific codes are added here as the business modules are built.</p>
 */
public enum ErrorCode {

    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Some fields are invalid."),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST, "The request body could not be read."),
    INVALID_PARAMETER(HttpStatus.BAD_REQUEST, "A request parameter is missing or invalid."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "The requested resource was not found."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "This HTTP method is not supported here."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "This content type is not supported."),
    CONFLICT(HttpStatus.CONFLICT, "The request conflicts with the current state of the data."),
    DATABASE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "The database is temporarily unavailable. Please try again later."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on our side. Please try again later.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    /** @return the HTTP status sent with this error */
    public HttpStatus status() {
        return status;
    }

    /** @return the message used when no more specific message is given */
    public String defaultMessage() {
        return defaultMessage;
    }
}
