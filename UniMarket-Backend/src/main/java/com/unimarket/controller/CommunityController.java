package com.unimarket.controller;

import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.promotion.PromotionDtos;
import com.unimarket.dto.review.ReviewDtos;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.account.ContactSettingsService;
import com.unimarket.service.admin.AdminFinanceService;
import com.unimarket.service.admin.ModerationService;
import com.unimarket.service.admin.ReportService;
import com.unimarket.service.promotion.PromotionService;
import com.unimarket.service.review.ReviewService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Student-facing Stage 5 endpoints: reviews and ratings, public profiles, reports, own disputes, moderation history of
 * own listings, promotions and contact settings. Identity always comes from the token (public reads excepted).
 */
@RestController
@Profile("!nodb")
public class CommunityController {

    private final ReviewService reviews;
    private final ReportService reports;
    private final AdminFinanceService disputes;
    private final ModerationService moderation;
    private final PromotionService promotions;
    private final ContactSettingsService contact;

    public CommunityController(ReviewService reviews, ReportService reports, AdminFinanceService disputes, ModerationService moderation,
                               PromotionService promotions, ContactSettingsService contact) {
        this.reviews = reviews;
        this.reports = reports;
        this.disputes = disputes;
        this.moderation = moderation;
        this.promotions = promotions;
        this.contact = contact;
    }

    // ------------------------------------------------------------------ reviews (D5)

    /** The signed-in participant reviews the other side of a completed order. 201. */
    @PostMapping("/api/orders/{orderId}/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewDtos.Review review(@PathVariable long orderId, @Valid @RequestBody ReviewDtos.ReviewRequest request,
                                    @AuthenticationPrincipal AuthenticatedUser user) {
        return reviews.submit(orderId, request.rating(), request.comment(), user);
    }

    /** {@code {canReview, mine, theirs}} for a participant of the order. */
    @GetMapping("/api/orders/{orderId}/reviews")
    public ReviewDtos.OrderReviews orderReviews(@PathVariable long orderId, @AuthenticationPrincipal AuthenticatedUser user) {
        return reviews.forOrder(orderId, user);
    }

    /** Public profile of an active student (public). */
    @GetMapping("/api/users/{userId}")
    public ReviewDtos.PublicProfile profile(@PathVariable int userId) {
        return reviews.profile(userId);
    }

    /** Public rating summary (public). */
    @GetMapping("/api/users/{userId}/ratings")
    public ReviewDtos.RatingSummary ratings(@PathVariable int userId) {
        return reviews.rating(userId);
    }

    /** Public reviews received; {@code role=SELLER|BUYER} filters by the side the user was on (public). */
    @GetMapping("/api/users/{userId}/reviews")
    public ReviewDtos.ReviewPage userReviews(@PathVariable int userId, @RequestParam(required = false) String role,
                                             @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return reviews.received(userId, role, page, size);
    }

    // ------------------------------------------------------------------ reports, disputes, moderation history

    /** Report a public listing or a student account. 201. */
    @PostMapping("/api/reports")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminDtos.Report report(@Valid @RequestBody ReportRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        return reports.create(request.targetType(), request.targetId(), request.reason(), request.details(), user);
    }

    @GetMapping("/api/me/reports")
    public List<AdminDtos.Report> myReports(@AuthenticationPrincipal AuthenticatedUser user) {
        return reports.mine(user);
    }

    /** Disputes of my orders (as buyer or seller). Opening one: {@code POST /api/orders/{id}/disputes} (Stage 4). */
    @GetMapping("/api/me/disputes")
    public List<AdminDtos.Dispute> myDisputes(@AuthenticationPrincipal AuthenticatedUser user) {
        return disputes.disputesOf(user);
    }

    /** Moderation decisions about my listing, with the admin's reason (no admin identity). */
    @GetMapping("/api/me/products/{productId}/moderation")
    public List<AdminDtos.ModerationEvent> moderationHistory(@PathVariable int productId, @AuthenticationPrincipal AuthenticatedUser user) {
        return moderation.historyForSeller(productId, user);
    }

    // ------------------------------------------------------------------ promotions

    /** Promotion packages with server-set prices and durations (public). */
    @GetMapping("/api/promotion-packages")
    public List<PromotionDtos.PromotionPackage> packages() {
        return promotions.packages();
    }

    /** Buy a package for my approved, available listing: 201 new / 200 pending one resumed. Not featured until paid. */
    @PostMapping("/api/products/{productId}/promotions")
    public ResponseEntity<PromotionDtos.Promotion> promote(@PathVariable int productId, @Valid @RequestBody PromotionDtos.PromotionRequest request,
                                                           @AuthenticationPrincipal AuthenticatedUser user) {
        PromotionDtos.Promotion promotion = promotions.start(productId, request.packageId(), request.provider(), user);
        return ResponseEntity.status(Boolean.TRUE.equals(promotion.resumed()) ? HttpStatus.OK : HttpStatus.CREATED).body(promotion);
    }

    @GetMapping("/api/me/products/{productId}/promotions")
    public List<PromotionDtos.Promotion> listingPromotions(@PathVariable int productId, @AuthenticationPrincipal AuthenticatedUser user) {
        return promotions.ofListing(productId, user);
    }

    @GetMapping("/api/me/promotions")
    public List<PromotionDtos.Promotion> myPromotions(@AuthenticationPrincipal AuthenticatedUser user) {
        return promotions.mine(user);
    }

    // ------------------------------------------------------------------ contact settings

    @GetMapping("/api/me/contact")
    public ContactSettingsService.Settings contact(@AuthenticationPrincipal AuthenticatedUser user) {
        return contact.get(user);
    }

    @PutMapping("/api/me/contact")
    public ContactSettingsService.Settings updateContact(@Valid @RequestBody ContactRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        return contact.update(request.phone(), request.zaloUrl(), Boolean.TRUE.equals(request.showContact()), user);
    }

    /**
     * @param targetType LISTING, USER or CONVERSATION (targetId = conversation id; participants only)
     * @param reason     MISLEADING, PROHIBITED, OFF_PLATFORM_PAYMENT, FAKE, HARASSMENT, SPAM, OTHER
     * @param details    optional, at most 500 characters
     */
    public record ReportRequest(@NotNull String targetType, @NotNull @Positive Integer targetId, @NotNull String reason,
                                @Size(max = 500) String details) {
    }

    /** @param showContact share phone / Zalo on listings and the public profile */
    public record ContactRequest(@Size(max = 20) String phone, @Size(max = 500) String zaloUrl, @NotNull Boolean showContact) {
    }
}
