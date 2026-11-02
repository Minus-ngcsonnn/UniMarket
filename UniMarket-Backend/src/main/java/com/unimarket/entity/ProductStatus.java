package com.unimarket.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;

/**
 * Listing availability, stored in {@code Products.Status} (Business Plan 6.5: Available → Reserved → Sold).
 * {@link #DRAFT} and {@link #REMOVED} are internal: they are never shown to buyers.
 * Reserved and Sold are set only by the order procedures ({@code usp_Checkout}, {@code usp_CompleteOrder}).
 */
public enum ProductStatus {

    DRAFT("Draft"),
    AVAILABLE("Available"),
    RESERVED("Reserved"),
    SOLD("Sold"),
    REMOVED("Removed");

    /** Statuses a buyer may see on a public product page. */
    public static final Set<ProductStatus> PUBLICLY_VISIBLE = EnumSet.of(AVAILABLE, RESERVED, SOLD);
    /** Statuses in which the seller may still edit, change photos or remove the listing. */
    public static final Set<ProductStatus> EDITABLE = EnumSet.of(DRAFT, AVAILABLE);

    private final String databaseValue;

    ProductStatus(String databaseValue) {
        this.databaseValue = databaseValue;
    }

    /** @return the value stored in {@code Products.Status} */
    public String databaseValue() {
        return databaseValue;
    }

    /** Maps {@link ProductStatus} to and from {@code Products.Status}. */
    @Converter
    public static class DatabaseConverter implements AttributeConverter<ProductStatus, String> {

        @Override
        public String convertToDatabaseColumn(ProductStatus status) {
            return status == null ? null : status.databaseValue;
        }

        @Override
        public ProductStatus convertToEntityAttribute(String value) {
            return value == null ? null : Arrays.stream(values()).filter(s -> s.databaseValue.equals(value)).findFirst()
                    .orElseThrow(() -> new IllegalStateException("Unknown Products.Status value: " + value));
        }
    }
}
