package com.unimarket.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/login}.
 *
 * @param email    account email (case-insensitive)
 * @param password account password
 */
public record LoginRequest(@NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 72) String password) {

    /** Hides the password if the object is ever logged. */
    @Override
    public String toString() {
        return "LoginRequest[email=" + email + "]";
    }
}
