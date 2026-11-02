package com.unimarket.exception;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.validation.BindException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.List;

/**
 * Turns every exception thrown while handling an API request into an {@link ApiErrorResponse}.
 *
 * <p>Client errors (4xx) explain what was wrong with the request. Server and database errors
 * (5xx) are logged in full here but only a generic message is returned, so no stack trace,
 * SQL statement or connection detail ever reaches the client.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Expected business errors thrown by services. */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApiException(ApiException ex, HttpServletRequest request) {
        return build(ex.getErrorCode(), ex.getMessage(), request, List.of());
    }

    /** {@code @Valid} request bodies and bound query objects with invalid fields. */
    @ExceptionHandler(BindException.class)
    public ResponseEntity<ApiErrorResponse> handleBindException(BindException ex, HttpServletRequest request) {
        List<ApiErrorResponse.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiErrorResponse.FieldError(error.getField(), error.getDefaultMessage()))
                .toList();
        return build(ErrorCode.VALIDATION_FAILED, null, request, fields);
    }

    /** Validation of {@code @RequestParam}/{@code @PathVariable} values on controller methods. */
    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodValidation(HandlerMethodValidationException ex, HttpServletRequest request) {
        List<ApiErrorResponse.FieldError> fields = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new ApiErrorResponse.FieldError(
                                result.getMethodParameter().getParameterName(), error.getDefaultMessage())))
                .toList();
        return build(ErrorCode.VALIDATION_FAILED, null, request, fields);
    }

    /** Validation of service-layer method arguments ({@code @Validated} beans). */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(ConstraintViolationException ex, HttpServletRequest request) {
        List<ApiErrorResponse.FieldError> fields = ex.getConstraintViolations().stream()
                .map(violation -> new ApiErrorResponse.FieldError(lastNode(violation.getPropertyPath().toString()), violation.getMessage()))
                .toList();
        return build(ErrorCode.VALIDATION_FAILED, null, request, fields);
    }

    /** Missing or unreadable JSON body. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadable(HttpMessageNotReadableException ex, HttpServletRequest request) {
        return build(ErrorCode.MALFORMED_REQUEST, null, request, List.of());
    }

    /** Missing required query parameter. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiErrorResponse> handleMissingParameter(MissingServletRequestParameterException ex, HttpServletRequest request) {
        return build(ErrorCode.INVALID_PARAMETER, null, request,
                List.of(new ApiErrorResponse.FieldError(ex.getParameterName(), "is required")));
    }

    /** Parameter of the wrong type, e.g. {@code /api/products/abc} for a numeric id. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        return build(ErrorCode.INVALID_PARAMETER, null, request,
                List.of(new ApiErrorResponse.FieldError(ex.getName(), "has an invalid value")));
    }

    /** Unknown URL. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNoResource(NoResourceFoundException ex, HttpServletRequest request) {
        return build(ErrorCode.NOT_FOUND, null, request, List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return build(ErrorCode.METHOD_NOT_ALLOWED, null, request, List.of());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleMediaType(HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        return build(ErrorCode.UNSUPPORTED_MEDIA_TYPE, null, request, List.of());
    }

    /** A database constraint rejected the change (unique key, foreign key, CHECK, trigger). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleIntegrity(DataIntegrityViolationException ex, HttpServletRequest request) {
        log.warn("Data integrity violation on {} {}: {}", request.getMethod(), request.getRequestURI(), ex.getMostSpecificCause().getMessage());
        return build(ErrorCode.CONFLICT, null, request, List.of());
    }

    /** SQL Server unreachable, login failed, pool exhausted… */
    @ExceptionHandler({CannotGetJdbcConnectionException.class, DataAccessResourceFailureException.class})
    public ResponseEntity<ApiErrorResponse> handleDatabaseUnavailable(Exception ex, HttpServletRequest request) {
        log.error("Database unavailable on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return build(ErrorCode.DATABASE_UNAVAILABLE, null, request, List.of());
    }

    /** Anything unexpected: logged with the stack trace, generic message for the client. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unexpected error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return build(ErrorCode.INTERNAL_ERROR, null, request, List.of());
    }

    private static ResponseEntity<ApiErrorResponse> build(ErrorCode code, String message, HttpServletRequest request,
                                                          List<ApiErrorResponse.FieldError> fieldErrors) {
        ApiErrorResponse body = new ApiErrorResponse(
                Instant.now(),
                code.status().value(),
                code.status().getReasonPhrase(),
                code.name(),
                message != null ? message : code.defaultMessage(),
                request.getRequestURI(),
                fieldErrors);
        return ResponseEntity.status(code.status()).body(body);
    }

    /** "createListing.request.title" → "title". */
    private static String lastNode(String path) {
        int dot = path.lastIndexOf('.');
        return dot >= 0 ? path.substring(dot + 1) : path;
    }
}
