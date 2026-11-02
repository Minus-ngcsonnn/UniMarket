package com.unimarket.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

/**
 * Writes Spring Security's 401 and 403 responses in the shared {@link ApiErrorResponse} format.
 * The reason a token was rejected (expired, bad signature, unknown account) is not revealed.
 */
public class JsonSecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    /** @param objectMapper the application's JSON mapper */
    public JsonSecurityErrorHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 401: no token, or the token is invalid / expired / for an account that cannot sign in. */
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) throws IOException {
        boolean tokenSent = request.getHeader(HttpHeaders.AUTHORIZATION) != null;
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, tokenSent ? "Bearer error=\"invalid_token\"" : "Bearer");
        write(response, request, ErrorCode.AUTHENTICATION_REQUIRED);
    }

    /** 403: signed in, but the role does not allow this request. */
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) throws IOException {
        write(response, request, ErrorCode.ACCESS_DENIED);
    }

    private void write(HttpServletResponse response, HttpServletRequest request, ErrorCode code) throws IOException {
        ApiErrorResponse body = new ApiErrorResponse(Instant.now(), code.status().value(), code.status().getReasonPhrase(),
                code.name(), code.defaultMessage(), request.getRequestURI(), List.of());
        response.setStatus(code.status().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
