package com.unimarket.dto.review;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Reviews and ratings (D5). */
public final class ReviewDtos {

    private ReviewDtos() {
    }

    /** @param rating 1–5 stars; @param comment optional, at most 500 characters */
    public record ReviewRequest(@NotNull @Min(1) @Max(5) Integer rating, @Size(max = 500) String comment) {
    }

    /**
     * @param direction BUYER_TO_SELLER (the buyer reviews the seller) or SELLER_TO_BUYER
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Review(long id, long orderId, Person reviewer, Person reviewee, String direction, int rating, String comment, Instant createdAt) {
    }

    /** Public identity only (no email, no contact). */
    public record Person(int id, String fullName) {
    }

    /**
     * Reviews of one order for one of its participants.
     *
     * @param canReview true when the order is completed and the viewer has not reviewed yet
     * @param mine      the viewer's review, or null
     * @param theirs    the other participant's review of the viewer, or null
     */
    public record OrderReviews(boolean canReview, Review mine, Review theirs) {
    }

    /**
     * Rating summary from visible reviews ({@code vw_UserRatings}; hidden reviews excluded).
     *
     * @param average      average stars (two decimals) or null when there are no reviews
     * @param distribution count per star, "1" … "5"
     * @param asSeller     reviews written by buyers about this user as a seller
     * @param asBuyer      reviews written by sellers about this user as a buyer
     */
    public record RatingSummary(int userId, BigDecimal average, int count, Map<String, Integer> distribution, int asSeller, int asBuyer) {
    }

    /**
     * Public profile ({@code vw_PublicProfiles}: active accounts only; phone / Zalo only when the user shares them).
     *
     * @param emailVerified the email was confirmed; NOT a verified-student claim (pending policy)
     * @param campusId      official campus, or null (V003)
     * @param university    official university name, or the SELF-DECLARED name (see {@code affiliationSource})
     * @param affiliationSource {@code OFFICIAL_CAMPUS} or {@code SELF_DECLARED}
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PublicProfile(int id, String fullName, String avatarUrl, Integer campusId, String campus, String university,
                                String affiliationSource, boolean emailVerified,
                                Instant memberSince, RatingSummary rating, Contact contact, int activeListings) {
    }

    /** Shared contact details (only with ShowContact). */
    public record Contact(String phone, String zaloUrl) {
    }

    /** Pages of public reviews. */
    public record ReviewPage(List<Review> items, int page, int size, long totalItems, int totalPages) {
    }
}
