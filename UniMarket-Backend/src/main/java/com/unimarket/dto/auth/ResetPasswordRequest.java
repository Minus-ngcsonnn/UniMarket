package com.unimarket.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/reset-password}.
 *
 * @param email       account email
 * @param code        the 6-digit code from the password-reset e-mail
 * @param newPassword 8-72 characters with at least one letter and one digit (same rule as registration)
 */
public record ResetPasswordRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be the 6-digit code from the e-mail") String code,
        @NotBlank @Size(min = 8, max = 72)
        @Pattern(regexp = "^(?=.*\\p{L})(?=.*\\d).+$", message = "must contain at least one letter and one digit")
        String newPassword) {

    /** Hides the code and password if the object is ever logged. */
    @Override
    public String toString() {
        return "ResetPasswordRequest[email=" + email + "]";
    }
}
