package com.unimarket.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/verify-email}.
 *
 * @param email account email
 * @param code  the 6-digit code from the verification e-mail
 */
public record VerifyEmailRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be the 6-digit code from the e-mail") String code) {
}
