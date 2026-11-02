package com.unimarket.exception;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;

import java.util.List;

/**
 * A request field rejected by a service rule that bean validation cannot express
 * (e.g. a password longer than 72 bytes, or a campus required for a multi-campus university).
 * Answered as 400 VALIDATION_FAILED with {@code fieldErrors}.
 */
public class ValidationException extends ApiException {

    private final List<ApiErrorResponse.FieldError> fieldErrors;

    /** @param fieldErrors the rejected fields */
    public ValidationException(List<ApiErrorResponse.FieldError> fieldErrors) {
        super(ErrorCode.VALIDATION_FAILED);
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    /**
     * A business error that points at specific fields or items (e.g. 409 LISTING_UNAVAILABLE naming each listing).
     *
     * @param errorCode   error code and HTTP status
     * @param message     client-safe message
     * @param fieldErrors the fields / items concerned
     */
    public ValidationException(ErrorCode errorCode, String message, List<ApiErrorResponse.FieldError> fieldErrors) {
        super(errorCode, message);
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    /** @return the rejected fields */
    public List<ApiErrorResponse.FieldError> getFieldErrors() {
        return fieldErrors;
    }
}
