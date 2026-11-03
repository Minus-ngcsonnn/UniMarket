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
    INVALID_CAMPUS(HttpStatus.BAD_REQUEST, "Choose one of the available campuses."),
    INVALID_VERIFICATION_CODE(HttpStatus.BAD_REQUEST, "The verification code is incorrect or has expired."),
    EMAIL_DELIVERY_FAILED(HttpStatus.SERVICE_UNAVAILABLE, "We couldn't send the verification email right now. Please try again in a minute."),
    TOO_MANY_ATTEMPTS(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please wait and try again later."),

    // Listings, photos and favorites (Backend Stage 3)
    INVALID_CATEGORY(HttpStatus.BAD_REQUEST, "Choose one of the available categories."),
    LISTING_NOT_EDITABLE(HttpStatus.CONFLICT, "This listing can no longer be changed because it is reserved, sold or removed."),
    INVALID_IMAGE(HttpStatus.BAD_REQUEST, "Photos must be JPG, PNG or WebP images."),
    TOO_MANY_IMAGES(HttpStatus.BAD_REQUEST, "A listing can have at most 8 photos."),
    IMAGE_REQUIRED(HttpStatus.BAD_REQUEST, "A listing needs at least one photo."),
    IMAGE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "Each photo must be 5 MB or smaller."),

    // Cart, checkout, orders, payments (Backend Stage 4)
    LISTING_UNAVAILABLE(HttpStatus.CONFLICT, "One or more listings are no longer available. Please review your cart."),
    OWN_LISTING(HttpStatus.CONFLICT, "You cannot buy your own listing."),
    PRICE_CHANGED(HttpStatus.CONFLICT, "The price of one or more listings has changed. Please review your cart."),
    CART_FULL(HttpStatus.BAD_REQUEST, "Your cart is full. Remove some items first."),
    ORDER_STATE_CONFLICT(HttpStatus.CONFLICT, "This order has already moved on. Refresh and try again."),
    ORDER_DEADLINE_PASSED(HttpStatus.CONFLICT, "The deadline for this step has passed."),
    ORDER_DISPUTED(HttpStatus.CONFLICT, "This order has an open dispute. An admin must resolve it first."),
    DISPUTE_NOT_ALLOWED(HttpStatus.CONFLICT, "A dispute cannot be opened for this order."),
    PAYMENT_IN_PROGRESS(HttpStatus.CONFLICT, "A payment for this order is still in progress."),
    PAYMENT_SIGNATURE_INVALID(HttpStatus.UNAUTHORIZED, "The payment notification could not be verified."),
    PAYMENT_MISMATCH(HttpStatus.BAD_REQUEST, "The payment notification does not match the payment request."),
    PAYMENT_CONFLICT(HttpStatus.CONFLICT, "The payment notification conflicts with the recorded result."),
    PAYMENT_TOO_LATE(HttpStatus.CONFLICT, "The payment arrived after the payment deadline. It will be refunded manually."),

    // Admin, reviews, reports, settlements, promotions (Backend Stage 5)
    LISTING_CHANGED(HttpStatus.CONFLICT, "The listing changed after you opened it. Reload it and review the new version."),
    MODERATION_CONFLICT(HttpStatus.CONFLICT, "The listing is not in a state that allows this moderation action."),
    ACCOUNT_STATE_CONFLICT(HttpStatus.CONFLICT, "The account is not in a state that allows this action."),
    REVIEW_NOT_ALLOWED(HttpStatus.CONFLICT, "You can review an order only after it is completed."),
    ALREADY_REVIEWED(HttpStatus.CONFLICT, "You have already reviewed this order."),
    REPORT_ALREADY_OPEN(HttpStatus.CONFLICT, "You have already reported this and it is still being handled."),
    REPORT_STATE_CONFLICT(HttpStatus.CONFLICT, "This report has already been handled."),
    DISPUTE_STATE_CONFLICT(HttpStatus.CONFLICT, "This dispute is not in a state that allows this action."),
    SETTLEMENT_ON_HOLD(HttpStatus.CONFLICT, "The order has an open dispute or an approved refund; the payout is on hold."),
    SETTLEMENT_STATE_CONFLICT(HttpStatus.CONFLICT, "This settlement is not pending."),
    PROMOTION_NOT_ALLOWED(HttpStatus.CONFLICT, "This listing cannot be promoted now."),
    // Nationwide registration, demo areas and simulated shipping (V003)
    INVALID_ZONE(HttpStatus.BAD_REQUEST, "Choose one of the available areas."),
    SHIPPING_QUOTE_INVALID(HttpStatus.BAD_REQUEST, "The shipping quote is not valid for this checkout. Get a new quote."),
    SHIPPING_QUOTE_CHANGED(HttpStatus.CONFLICT, "The shipping estimate has expired or changed. Review the new estimate."),
    SHIPPING_UNAVAILABLE(HttpStatus.CONFLICT, "Simulated delivery is not available for one or more items to this area."),
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
