package com.unimarket.dto.auth;

import com.unimarket.dto.product.ReferenceDtos;
import com.unimarket.entity.Campus;
import com.unimarket.entity.User;

import java.time.Instant;
import java.time.ZoneOffset;

/**
 * Safe public view of an account. Never contains the password hash or phone number.
 *
 * @param id            {@code Users.UserId}
 * @param email         account email
 * @param fullName      display name
 * @param role          {@code STUDENT} or {@code ADMIN}
 * @param emailVerified true once the email address is verified with the code (ownership only, not enrolment)
 * @param campusId      the official campus, or null (V003: self-declared university instead)
 * @param campusName    e.g. "FPT Hoa Lac", or null
 * @param university    official university name, or the self-declared name (see {@code affiliation.source})
 * @param affiliation   where {@code university} comes from; never a verification claim
 * @param homeZone      optional default area (V003), or null
 * @param memberSince   account creation time (UTC)
 */
public record UserResponse(Integer id, String email, String fullName, String role, boolean emailVerified,
                           Integer campusId, String campusName, String university, Affiliation affiliation,
                           ReferenceDtos.ZoneRef homeZone, Instant memberSince) {

    /**
     * @param campusId       official campus, or null
     * @param campusName     official campus name, or null
     * @param universityName official university or self-declared name (null only for an admin without either)
     * @param source         {@code OFFICIAL_CAMPUS}, {@code SELF_DECLARED} or {@code NONE} (admins)
     */
    public record Affiliation(Integer campusId, String campusName, String universityName, String source) {

        /** @return the affiliation of an account (campus and university must be loaded when present) */
        public static Affiliation of(Campus campus, String declaredUniversityName) {
            if (campus != null) {
                return new Affiliation(campus.getId(), campus.getName(), campus.getUniversity().getName(), "OFFICIAL_CAMPUS");
            }
            if (declaredUniversityName != null) {
                return new Affiliation(null, null, declaredUniversityName, "SELF_DECLARED");
            }
            return new Affiliation(null, null, null, "NONE");
        }
    }

    /**
     * @param user account with campus, university and home zone loaded
     * @return the public view
     */
    public static UserResponse from(User user) {
        Affiliation affiliation = Affiliation.of(user.getCampus(), user.getDeclaredUniversityName());
        return new UserResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole().name(),
                user.getEmailVerifiedAt() != null, affiliation.campusId(), affiliation.campusName(),
                affiliation.universityName(), affiliation, ReferenceDtos.ZoneRef.from(user.getHomeZone()),
                user.getCreatedAt().toInstant(ZoneOffset.UTC));
    }
}
