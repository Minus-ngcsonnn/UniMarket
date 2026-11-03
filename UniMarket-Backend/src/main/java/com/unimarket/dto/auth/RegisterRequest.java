package com.unimarket.dto.auth;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/register}. There is deliberately no role field: every public
 * registration creates a student account (unknown JSON fields such as "role" are ignored).
 *
 * @param fullName       display name, 2-150 characters
 * @param email          ANY valid email address (Gmail, Outlook, Yahoo, institutional…); a domain with a dot is required,
 *                       like the database CHECK ({@code Email LIKE '%_@_%._%'}). Its domain decides nothing.
 * @param password       8-72 characters with at least one letter and one digit
 * @param campusId       an official campus from {@code GET /api/campuses} (must exist), OR
 * @param universityName the student's university / college typed as free text when it is not listed (2-200 characters,
 *                       stored as self-declared and never shown as verified). Exactly one of the two is required.
 * @param homeZoneId     optional default area from {@code GET /api/locations/zones}
 */
public record RegisterRequest(
        @NotBlank @Size(min = 2, max = 150) String fullName,
        @NotBlank @Email @Size(max = 254)
        @Pattern(regexp = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "must be a valid email address")
        String email,
        @NotBlank @Size(min = 8, max = 72)
        @Pattern(regexp = "^(?=.*\\p{L})(?=.*\\d).+$", message = "must contain at least one letter and one digit")
        String password,
        @Positive Integer campusId,
        @Size(max = 200) String universityName,
        @Positive Integer homeZoneId) {

    /** @return the trimmed university name with inner whitespace collapsed, or null when blank / absent */
    public String normalizedUniversityName() {
        if (universityName == null) {
            return null;
        }
        String name = universityName.strip().replaceAll("\\s+", " ");
        return name.isEmpty() ? null : name;
    }

    /** Exactly one affiliation: an official campus or a self-declared university name. */
    @AssertTrue(message = "choose a campus or type your university name (not both)")
    public boolean isAffiliationProvided() {
        return (campusId != null) != (normalizedUniversityName() != null);
    }

    /** A typed university name needs at least 2 characters (database CHECK CK_Users_Affiliation). */
    @AssertTrue(message = "must be 2-200 characters")
    public boolean isUniversityNameLongEnough() {
        String name = normalizedUniversityName();
        return name == null || name.length() >= 2;
    }

    /** Hides the password if the object is ever logged. */
    @Override
    public String toString() {
        return "RegisterRequest[fullName=" + fullName + ", email=" + email + ", campusId=" + campusId
                + ", universityName=" + universityName + ", homeZoneId=" + homeZoneId + "]";
    }
}
