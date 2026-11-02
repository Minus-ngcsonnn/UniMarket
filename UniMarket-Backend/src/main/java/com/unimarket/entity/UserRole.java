package com.unimarket.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;

/**
 * Account role, stored in {@code Users.Role} as {@code 'Student'} or {@code 'Admin'}.
 *
 * <p>One student account both buys and sells. {@link #ADMIN} is never assigned by public
 * registration; admin accounts are created by the database owner.</p>
 */
public enum UserRole {

    STUDENT("Student"),
    ADMIN("Admin");

    private final String databaseValue;

    UserRole(String databaseValue) {
        this.databaseValue = databaseValue;
    }

    /** @return the value stored in {@code Users.Role} */
    public String databaseValue() {
        return databaseValue;
    }

    /** @return the Spring Security authority, e.g. {@code ROLE_STUDENT} */
    public String authority() {
        return "ROLE_" + name();
    }

    /** Maps {@link UserRole} to and from {@code Users.Role}. */
    @Converter
    public static class DatabaseConverter implements AttributeConverter<UserRole, String> {

        @Override
        public String convertToDatabaseColumn(UserRole role) {
            return role == null ? null : role.databaseValue;
        }

        @Override
        public UserRole convertToEntityAttribute(String value) {
            return value == null ? null : Arrays.stream(values())
                    .filter(role -> role.databaseValue.equals(value))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException("Unknown Users.Role value: " + value));
        }
    }
}
