package com.unimarket.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/resend-verification}.
 *
 * @param email account email
 */
public record ResendVerificationRequest(@NotBlank @Size(max = 254) String email) {
}
