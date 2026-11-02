package com.unimarket.common;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/**
 * The one error format returned by every UniMarket API endpoint.
 *
 * <p>Example:</p>
 * <pre>{@code
 * {
 *   "timestamp": "2026-11-02T08:00:00Z",
 *   "status": 400,
 *   "error": "Bad Request",
 *   "code": "VALIDATION_FAILED",
 *   "message": "Some fields are invalid.",
 *   "path": "/api/example",
 *   "fieldErrors": [ { "field": "email", "message": "must be a well-formed email address" } ]
 * }
 * }</pre>
 *
 * <p>Messages are written for API clients. They never contain stack traces, SQL or
 * connection details.</p>
 *
 * @param timestamp   when the error happened (UTC)
 * @param status      HTTP status code
 * @param error       HTTP reason phrase
 * @param code        stable machine-readable error code, see {@link ErrorCode}
 * @param message     short human-readable explanation
 * @param path        request path
 * @param fieldErrors invalid fields, only present for validation errors
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String error,
        String code,
        String message,
        String path,
        List<FieldError> fieldErrors) {

    /**
     * One invalid request field.
     *
     * @param field   name of the field or parameter
     * @param message why the value was rejected
     */
    public record FieldError(String field, String message) {
    }
}
