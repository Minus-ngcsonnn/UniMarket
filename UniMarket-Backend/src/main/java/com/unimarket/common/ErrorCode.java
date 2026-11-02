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

    // Authentication and student verification (Backend Stage 2)
    AUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "Sign in to continue."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "The email or password is incorrect."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "You do not have permission to do this."),
    EMAIL_NOT_VERIFIED(HttpStatus.FORBIDDEN, "Verify your email address before signing in."),
    ACCOUNT_DISABLED(HttpStatus.FORBIDDEN, "This account cannot be used. Contact UniMarket support."),
    EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "An account with this email already exists."),
    UNSUPPORTED_EMAIL_DOMAIN(HttpStatus.BAD_REQUEST, "Use the email address given to you by your university."),
    INVALID_CAMPUS(HttpStatus.BAD_REQUEST, "Choose a campus of your university."),
    INVALID_VERIFICATION_CODE(HttpStatus.BAD_REQUEST, "The verification code is incorrect or has expired."),
    TOO_MANY_ATTEMPTS(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please wait and try again later."),

    // Listings, photos and favorites (Backend Stage 3)
    INVALID_CATEGORY(HttpStatus.BAD_REQUEST, "Choose one of the available categories."),
    LISTING_NOT_EDITABLE(HttpStatus.CONFLICT, "This listing can no longer be changed because it is reserved, sold or removed."),
    INVALID_IMAGE(HttpStatus.BAD_REQUEST, "Photos must be JPG, PNG or WebP images."),
    TOO_MANY_IMAGES(HttpStatus.BAD_REQUEST, "A listing can have at most 8 photos."),
    IMAGE_REQUIRED(HttpStatus.BAD_REQUEST, "A listing needs at least one photo."),
    IMAGE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "Each photo must be 5 MB or smaller."),
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
