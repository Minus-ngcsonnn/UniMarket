package com.unimarket.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;

/**
 * Listing moderation (Business Plan 3.2: the platform moderates listings), stored in
 * {@code Products.ModerationStatus}. Approved decision (2026-11-01): pre-moderation — new and edited
 * listings are {@link #PENDING} and hidden from buyers until an admin approves them.
 * The API calls {@code 'Rejected'} {@code BLOCKED}, matching the frontend.
 */
public enum ModerationStatus {

    PENDING("Pending", "PENDING"),
    APPROVED("Approved", "APPROVED"),
    REJECTED("Rejected", "BLOCKED");

    private final String databaseValue;
    private final String apiValue;

    ModerationStatus(String databaseValue, String apiValue) {
        this.databaseValue = databaseValue;
        this.apiValue = apiValue;
    }

    /** @return the value used in API responses ({@code PENDING}, {@code APPROVED}, {@code BLOCKED}) */
    public String apiValue() {
        return apiValue;
    }

    /** Maps {@link ModerationStatus} to and from {@code Products.ModerationStatus}. */
    @Converter
    public static class DatabaseConverter implements AttributeConverter<ModerationStatus, String> {

        @Override
        public String convertToDatabaseColumn(ModerationStatus status) {
            return status == null ? null : status.databaseValue;
        }

        @Override
        public ModerationStatus convertToEntityAttribute(String value) {
            return value == null ? null : Arrays.stream(values()).filter(s -> s.databaseValue.equals(value)).findFirst()
                    .orElseThrow(() -> new IllegalStateException("Unknown Products.ModerationStatus value: " + value));
        }
    }
}
