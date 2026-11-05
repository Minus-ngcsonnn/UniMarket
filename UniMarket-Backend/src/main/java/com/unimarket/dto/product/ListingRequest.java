package com.unimarket.dto.product;

import com.unimarket.entity.ProductCondition;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Listing fields for create ({@code POST /api/products}, JSON part "listing") and edit
 * ({@code PUT /api/products/{id}}). Limits are the approved frontend limits (constants/product.js
 * LISTING_LIMITS). There is no seller field: the seller is always the signed-in user.
 *
 * @param title         5–80 characters
 * @param description   20–1000 characters
 * @param price         1,000–100,000,000 VND
 * @param originalPrice optional reference price, higher than {@code price}
 * @param condition     NEW, LIKE_NEW or USED
 * @param categoryId    an active category
 * @param customCategory required (2–60 characters, letters or digits) when the category is "Other" (V005
 *                      {@code AllowsCustomName}); ignored for every other category
 * @param campusId      optional; a campus of the seller's university (default: the seller's campus). Not allowed for a
 *                      seller without a campus (V003 self-declared university)
 * @param pickupZoneId  optional demo pickup area ({@code GET /api/locations/zones}); required for a seller without a campus;
 *                      when absent the campus area is used
 */
public record ListingRequest(
        @NotBlank @Size(min = 5, max = 80) String title,
        @NotBlank @Size(min = 20, max = 1000) String description,
        @NotNull @Min(1_000) @Max(100_000_000) Long price,
        @Min(1_000) @Max(100_000_000) Long originalPrice,
        @NotNull ProductCondition condition,
        @NotNull @Positive Integer categoryId,
        @Positive Integer campusId,
        @Positive Integer pickupZoneId,
        @Size(max = 200) String customCategory) {

    /** The original price, when given, must be higher than the price (frontend rule; SQL allows equal). */
    @AssertTrue(message = "must be higher than price")
    public boolean isOriginalPriceHigherThanPrice() {
        return originalPrice == null || price == null || originalPrice > price;
    }
}
