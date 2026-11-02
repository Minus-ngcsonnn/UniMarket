package com.unimarket.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/register}. There is deliberately no role field: every public
 * registration creates a student account (unknown JSON fields such as "role" are ignored).
 *
 * @param fullName display name, 2-150 characters
 * @param email    institutional email; its domain must be in {@code UniversityEmailDomains}
 * @param password 8-72 characters with at least one letter and one digit
 * @param campusId optional; required only when the university has more than one campus
 */
public record RegisterRequest(
        @NotBlank @Size(min = 2, max = 150) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 8, max = 72)
        @Pattern(regexp = "^(?=.*\\p{L})(?=.*\\d).+$", message = "must contain at least one letter and one digit")
        String password,
        @Positive Integer campusId) {

    /** Hides the password if the object is ever logged. */
    @Override
    public String toString() {
        return "RegisterRequest[fullName=" + fullName + ", email=" + email + ", campusId=" + campusId + "]";
    }
}
