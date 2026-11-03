package com.unimarket.dto.auth;

import java.time.Instant;

/**
 * Response of {@code POST /api/auth/register} (201).
 *
 * @param user                 the new, not yet verified account
 * @param verificationRequired always true: the account must be verified before signing in
 * @param codeExpiresAt        when the e-mailed code expires (UTC)
 * @param emailDelivery        what happened to the verification e-mail, decided after the account was committed:
 *                             {@code SENT} (the provider accepted it), {@code LOGGED} (development log mode, nothing
 *                             sent) or {@code FAILED} (refused / no answer: the account exists, request a new code
 *                             after the cooldown). Never claims delivery to the inbox itself.
 */
public record RegisterResponse(UserResponse user, boolean verificationRequired, Instant codeExpiresAt, String emailDelivery) {
}
