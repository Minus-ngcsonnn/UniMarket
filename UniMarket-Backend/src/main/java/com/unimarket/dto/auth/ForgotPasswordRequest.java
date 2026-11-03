package com.unimarket.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/forgot-password}.
 *
 * @param email the account email; the answer is the same whether or not it is registered
 */
public record ForgotPasswordRequest(@NotBlank @Size(max = 254) String email) {
}
