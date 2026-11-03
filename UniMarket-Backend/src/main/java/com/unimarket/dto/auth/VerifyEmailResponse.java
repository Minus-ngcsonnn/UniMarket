package com.unimarket.dto.auth;

import java.time.Instant;

/**
 * Response of {@code POST /api/auth/verify-email}: the email is verified AND the account is signed in (same token as
 * {@code POST /api/auth/login}), so the student does not have to type the password again.
 *
 * @param message     confirmation text
 * @param accessToken signed JWT, sent as {@code Authorization: Bearer <token>}
 * @param tokenType   always {@code Bearer}
 * @param expiresIn   lifetime in seconds
 * @param expiresAt   expiry time (UTC)
 * @param user        the signed-in account
 */
public record VerifyEmailResponse(String message, String accessToken, String tokenType, long expiresIn, Instant expiresAt,
                                  UserResponse user) {

    public static VerifyEmailResponse of(String message, LoginResponse login) {
        return new VerifyEmailResponse(message, login.accessToken(), login.tokenType(), login.expiresIn(), login.expiresAt(), login.user());
    }

    /** Keeps the token out of logs. */
    @Override
    public String toString() {
        return "VerifyEmailResponse[tokenType=" + tokenType + ", expiresAt=" + expiresAt + ", user=" + user + "]";
    }
}
