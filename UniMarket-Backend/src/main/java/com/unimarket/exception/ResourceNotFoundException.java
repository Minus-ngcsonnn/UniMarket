package com.unimarket.exception;

import com.unimarket.common.ErrorCode;

/**
 * Thrown when a requested record does not exist (HTTP 404).
 */
public class ResourceNotFoundException extends ApiException {

    /**
     * @param message client-safe message, e.g. "Listing not found."
     */
    public ResourceNotFoundException(String message) {
        super(ErrorCode.NOT_FOUND, message);
    }
}
