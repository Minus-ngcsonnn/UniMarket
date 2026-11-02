package com.unimarket.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;

/**
 * Account status, stored in {@code Users.Status}. Only {@link #ACTIVE} accounts can sign in.
 */
public enum UserStatus {

    ACTIVE("Active"),
    SUSPENDED("Suspended"),
    CLOSED("Closed");

    private final String databaseValue;

    UserStatus(String databaseValue) {
        this.databaseValue = databaseValue;
    }

    /** @return the value stored in {@code Users.Status} */
    public String databaseValue() {
        return databaseValue;
    }

    /** Maps {@link UserStatus} to and from {@code Users.Status}. */
    @Converter
    public static class DatabaseConverter implements AttributeConverter<UserStatus, String> {

        @Override
        public String convertToDatabaseColumn(UserStatus status) {
            return status == null ? null : status.databaseValue;
        }

        @Override
        public UserStatus convertToEntityAttribute(String value) {
            return value == null ? null : Arrays.stream(values())
                    .filter(status -> status.databaseValue.equals(value))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException("Unknown Users.Status value: " + value));
        }
    }
}
