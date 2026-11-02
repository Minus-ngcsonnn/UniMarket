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

    /** @return the rejected fields */
    public List<ApiErrorResponse.FieldError> getFieldErrors() {
        return fieldErrors;
    }
}
