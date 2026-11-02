package com.unimarket.dto.auth;

import java.time.Instant;

/**
 * Response of {@code POST /api/auth/login}.
 *
 * @param accessToken signed JWT, sent as {@code Authorization: Bearer <token>}
 * @param tokenType   always {@code Bearer}
 * @param expiresIn   lifetime in seconds
 * @param expiresAt   expiry time (UTC)
 * @param user        the signed-in account
 */
public record LoginResponse(String accessToken, String tokenType, long expiresIn, Instant expiresAt, UserResponse user) {

    /** Keeps the token out of logs. */
    @Override
    public String toString() {
        return "LoginResponse[tokenType=" + tokenType + ", expiresAt=" + expiresAt + ", user=" + user + "]";
    }
}
