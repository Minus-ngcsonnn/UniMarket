package com.unimarket.dto.auth;

import java.time.Instant;

/**
 * Response of {@code POST /api/auth/register} (201).
 *
 * @param user                 the new, not yet verified account
 * @param verificationRequired always true: the account must be verified before signing in
 * @param codeExpiresAt        when the e-mailed code expires (UTC)
 */
public record RegisterResponse(UserResponse user, boolean verificationRequired, Instant codeExpiresAt) {
}
