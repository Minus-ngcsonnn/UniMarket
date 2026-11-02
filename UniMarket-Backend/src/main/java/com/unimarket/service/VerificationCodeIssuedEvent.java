package com.unimarket.service;

import java.time.Instant;

/**
 * Published when a verification code is issued. The e-mail is sent only after the database
 * transaction commits ({@link VerificationEmailListener}), so no code is mailed for a rolled-back
 * registration. The plain code only lives in memory; it is never stored or returned by the API.
 *
 * @param email     recipient
 * @param fullName  recipient name
 * @param code      the 6-digit code
 * @param expiresAt code expiry (UTC)
 */
public record VerificationCodeIssuedEvent(String email, String fullName, String code, Instant expiresAt) {

    /** Keeps the code out of logs. */
    @Override
    public String toString() {
        return "VerificationCodeIssuedEvent[email=" + email + ", expiresAt=" + expiresAt + "]";
    }
}
