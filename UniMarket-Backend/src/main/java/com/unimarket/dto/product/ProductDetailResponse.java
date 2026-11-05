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
        boolean purchasable, ReferenceDtos.CategoryRef category, ReferenceDtos.CampusRef campus, ReferenceDtos.ZoneRef pickupZone,
        List<ImageResponse> images,
        SellerProfile seller, boolean featured, Instant createdAt, Instant updatedAt, String moderation, Boolean editable,
        PickupPoint pickupPoint) {

    /**
     * V006: the seller's confirmed handover point. Sent ONLY to the seller of the listing (not to admins, not to
     * buyers: a buyer gets the order snapshot after payment); public responses carry only {@code pickupZone}.
     */
    public record PickupPoint(java.math.BigDecimal latitude, java.math.BigDecimal longitude, String instructions) {
    }

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
     *                        It proves email ownership only, NOT student status (team decision, Nov 2026:
     *                        registration with any email + OTP, no student verification). The API never sends
     *                        {@code verified} / {@code verifiedStudent}.
     * @param campus          seller's official campus, or null (V003)
     * @param university      official university name or the seller's SELF-DECLARED name (unverified)
     * @param affiliationSource {@code OFFICIAL_CAMPUS}, {@code SELF_DECLARED} or {@code NONE}
     * @param memberSince     account creation (UTC)
     * @param ratingAverage   average stars from visible reviews, or null
     * @param ratingCount     number of visible reviews
     * @param contact         phone / Zalo, only when the seller chose to share them ({@code Users.ShowContact = 1});
     *                        omitted otherwise (Business Plan 3.2, 6.7)
     */
    public record SellerProfile(Integer id, String fullName, boolean emailVerified, ReferenceDtos.CampusRef campus,
                                String university, String affiliationSource, Instant memberSince, BigDecimal ratingAverage, int ratingCount,
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
