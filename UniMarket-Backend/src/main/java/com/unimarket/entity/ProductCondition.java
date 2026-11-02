package com.unimarket.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;

/**
 * Item condition (Business Plan 3.4 / 6.3: New, Like New, Used), stored in {@code Products.Condition}
 * as {@code 'New'}, {@code 'Like New'}, {@code 'Used'}; the API uses {@code NEW}, {@code LIKE_NEW}, {@code USED}.
 */
public enum ProductCondition {

    NEW("New"),
    LIKE_NEW("Like New"),
    USED("Used");

    private final String databaseValue;

    ProductCondition(String databaseValue) {
        this.databaseValue = databaseValue;
    }

    /** @return the value stored in {@code Products.Condition} */
    public String databaseValue() {
        return databaseValue;
    }

    /** Maps {@link ProductCondition} to and from {@code Products.Condition}. */
    @Converter
    public static class DatabaseConverter implements AttributeConverter<ProductCondition, String> {

        @Override
        public String convertToDatabaseColumn(ProductCondition condition) {
            return condition == null ? null : condition.databaseValue;
        }

        @Override
        public ProductCondition convertToEntityAttribute(String value) {
            return value == null ? null : Arrays.stream(values()).filter(c -> c.databaseValue.equals(value)).findFirst()
                    .orElseThrow(() -> new IllegalStateException("Unknown Products.Condition value: " + value));
        }
    }
}
