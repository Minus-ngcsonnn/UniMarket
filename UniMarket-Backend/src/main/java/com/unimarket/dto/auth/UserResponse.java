package com.unimarket.dto.auth;

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
 * @param emailVerified true once the institutional email is verified
 * @param campusId      the student's campus
 * @param campusName    e.g. "FPT Hoa Lac"
 * @param university    e.g. "FPT University"
 * @param memberSince   account creation time (UTC)
 */
public record UserResponse(Integer id, String email, String fullName, String role, boolean emailVerified,
                           Integer campusId, String campusName, String university, Instant memberSince) {

    /**
     * @param user account with campus and university loaded
     * @return the public view
     */
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole().name(),
                user.getEmailVerifiedAt() != null, user.getCampus().getId(), user.getCampus().getName(),
                user.getCampus().getUniversity().getName(), user.getCreatedAt().toInstant(ZoneOffset.UTC));
    }
}
