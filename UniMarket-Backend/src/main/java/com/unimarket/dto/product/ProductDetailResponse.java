package com.unimarket.dto.product;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Product page.
 *
 * <p>The seller block contains only public information. Phone / Zalo are NOT returned in Stage 3:
 * the database has an opt-in flag ({@code Users.ShowContact}) but the disclosure rule for the API
 * (signed-in viewers only, or everyone) is still to be decided.</p>
 *
 * @param images     all photos, main photo first
 * @param moderation only for the owner or an admin
 * @param editable   only for the owner or an admin
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductDetailResponse(
        Integer id, String title, String description, Long price, Long originalPrice, String condition, String status,
        boolean purchasable, ReferenceDtos.CategoryRef category, ReferenceDtos.CampusRef campus, List<ImageResponse> images,
        SellerProfile seller, boolean featured, Instant createdAt, Instant updatedAt, String moderation, Boolean editable) {

    /**
     * @param id        {@code ProductImages.ImageId}
     * @param url       stored reference, e.g. {@code /media/products/<id>.jpg}
     * @param sortOrder 0-based position; the lowest is the main photo
     */
    public record ImageResponse(Integer id, String url, int sortOrder) {
    }

    /**
     * @param id              {@code Users.UserId}
     * @param fullName        display name
     * @param emailVerified   the account confirmed its email with a code ({@code Users.EmailVerifiedAt}).
     *                        This is NOT proof of student status: the student verification policy is a pending
     *                        team decision, and the database has no separate "verified student" field. The API
     *                        therefore never sends {@code verified} / {@code verifiedStudent}.
     * @param campus          seller's campus
     * @param memberSince     account creation (UTC)
     * @param ratingAverage   average stars from visible reviews, or null
     * @param ratingCount     number of visible reviews
     * @param contact         phone / Zalo, only when the seller chose to share them ({@code Users.ShowContact = 1});
     *                        omitted otherwise (Business Plan 3.2, 6.7)
     */
    public record SellerProfile(Integer id, String fullName, boolean emailVerified, ReferenceDtos.CampusRef campus,
                                Instant memberSince, BigDecimal ratingAverage, int ratingCount,
                                @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
                                Contact contact) {
    }

    /**
     * Contact details the seller chose to share (either may be null).
     *
     * @param phone   {@code Users.Phone}
     * @param zaloUrl {@code Users.ZaloUrl}
     */
    public record Contact(String phone, String zaloUrl) {

        /** @return the shared contact, or null when the seller does not share it or has none */
        public static Contact of(boolean shared, String phone, String zaloUrl) {
            return shared && (phone != null || zaloUrl != null) ? new Contact(phone, zaloUrl) : null;
        }
    }
}
