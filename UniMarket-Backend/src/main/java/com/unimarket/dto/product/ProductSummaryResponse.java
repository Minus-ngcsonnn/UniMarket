package com.unimarket.dto.product;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * One listing in a catalog page, "My listings" or "Saved items".
 *
 * @param id            {@code Products.ProductId}
 * @param title         title
 * @param price         price in whole VND
 * @param originalPrice reference new price in VND, or null (no "% off" without it)
 * @param condition     {@code NEW}, {@code LIKE_NEW} or {@code USED}
 * @param status        {@code AVAILABLE}, {@code RESERVED}, {@code SOLD} (owners may also see {@code DRAFT})
 * @param purchasable   true only when the item can be ordered now (available and approved)
 * @param category      category
 * @param campus        campus and university of the item, or null (V003: listing located by pickup area only)
 * @param pickupZone    effective demo pickup area (explicit area, else the campus area); approximate
 * @param mainImageUrl  photo with the lowest sort order, or null
 * @param seller        seller's public name
 * @param featured      a paid promotion is running now
 * @param createdAt     listing time (UTC)
 * @param moderation    {@code PENDING}, {@code APPROVED} or {@code BLOCKED}; only in the seller's own views
 * @param editable      only in the seller's own views: whether it can still be edited / removed
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductSummaryResponse(
        Integer id, String title, Long price, Long originalPrice, String condition, String status, boolean purchasable,
        ReferenceDtos.CategoryRef category, ReferenceDtos.CampusRef campus, ReferenceDtos.ZoneRef pickupZone, String mainImageUrl, SellerRef seller,
        boolean featured, Instant createdAt, String moderation, Boolean editable) {

    /**
     * @param id       {@code Users.UserId}
     * @param fullName display name (no email, phone or address)
     */
    public record SellerRef(Integer id, String fullName) {
    }
}
