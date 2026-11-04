package com.unimarket.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Request and response types of the admin API ({@code /api/admin/**}, role Admin only). */
public final class AdminDtos {

    private AdminDtos() {
    }

    // ------------------------------------------------------------------ listings (moderation)

    /**
     * A listing in the moderation queue.
     *
     * @param moderation PENDING, APPROVED or BLOCKED ({@code Products.ModerationStatus} Pending / Approved / Rejected)
     * @param status     sale status, separate from moderation: DRAFT, AVAILABLE, RESERVED, SOLD, REMOVED
     * @param version    the listing version ({@code Products.Version}, hex). Send it back to approve or reject exactly
     *                   the version you reviewed.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Listing(int id, String title, long price, String condition, String status, String moderation, String version,
                          Ref category, Ref seller, String sellerStatus, String mainImageUrl, Instant createdAt, Instant updatedAt,
                          int openReports, String description, List<String> images, List<ModerationEvent> history) {
    }

    /** Id and name. */
    public record Ref(int id, String name) {
    }

    /**
     * One moderation event ({@code AdminActions}).
     *
     * @param action APPROVED, REJECTED, BLOCKED or REMOVED
     * @param reason the admin's reason (rejections, blocks, removals)
     * @param admin  the admin (admin views only; omitted for sellers)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ModerationEvent(String action, String reason, Ref admin, Instant at) {
    }

    /** @param version the version reviewed (from the listing); @param note optional note */
    public record ApproveRequest(@NotBlank String version, @Size(max = 1000) String note) {
    }

    /** @param version the version reviewed; @param reason shown to the seller (10–1000 characters) */
    public record RejectRequest(@NotBlank String version, String reason) {
    }

    /** @param reason why (10–1000 characters) */
    public record ReasonRequest(String reason) {
    }

    /** @param purpose why private data is needed, e.g. "Dispute 12: buyer cannot reach the seller" (10–1000 characters) */
    public record PurposeRequest(String purpose) {
    }

    /** @param resolution what was decided / done (10–2000 characters) */
    public record ResolutionRequest(String resolution) {
    }

    // ------------------------------------------------------------------ users

    /**
     * Safe account view for admins. Never contains password hashes, codes or tokens.
     *
     * @param emailVerified the email was confirmed with a code; NOT proof of student status (pending policy)
     * @param campus        official campus, or null (V003)
     * @param declaredUniversity self-declared university name (unverified, V003), or null
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record User(int id, String email, String fullName, String role, String status, boolean emailVerified, Ref campus,
                       String declaredUniversity, Instant createdAt, int listingCount, int ordersAsBuyer, int ordersAsSeller, java.math.BigDecimal ratingAverage,
                       int ratingCount, int openReports, String phone, String zaloUrl, Boolean showContact,
                       List<ModerationEvent> history) {
    }

    // ------------------------------------------------------------------ reports

    /**
     * A violation report ({@code Reports}).
     *
     * @param targetType LISTING or USER
     * @param reasonCode MISLEADING, PROHIBITED, OFF_PLATFORM_PAYMENT, FAKE, HARASSMENT, SPAM, OTHER
     * @param status     OPEN, REVIEWING, RESOLVED, DISMISSED
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Report(long id, String code, String targetType, Target target, Ref reporter, String reasonCode, String details,
                         String status, String resolution, Instant createdAt, Instant resolvedAt) {
    }

    /** @param label listing title or account name; @param status listing moderation or account status */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Target(String type, int id, String label, String status, Ref owner) {
    }

    // ------------------------------------------------------------------ disputes and settlements

    /**
     * An order dispute (D3) for admins.
     *
     * @param decision        NO_REFUND or REFUND_APPROVED (a decision only, no money moved)
     * @param refundReference reference of a refund made outside UniMarket, recorded by an admin
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Dispute(long id, long orderId, String orderStatus, String openedBy, Ref opener, Ref buyer, Ref seller, String reason,
                          String status, String decision, String resolution, Ref resolvedBy, Instant createdAt, Instant resolvedAt,
                          String refundReference, Instant refundConfirmedAt, long orderTotal, boolean sandbox) {
    }

    /** @param decision NO_REFUND or REFUND_APPROVED; @param resolution explanation (10–2000 characters) */
    public record ResolveDisputeRequest(@NotBlank String decision, String resolution) {
    }

    /** @param refundReference the provider / bank reference of the refund made outside UniMarket */
    public record RefundConfirmationRequest(@NotBlank @Size(max = 100) String refundReference) {
    }

    /**
     * Seller settlement (D1, D4, D6) — amounts exactly as stored, never recalculated.
     *
     * @param status       PENDING (owed, not paid) or RELEASED (an admin recorded a manual payout)
     * @param onHold       true while the order has an open dispute or an approved refund (release refused)
     * @param sandbox      true when the order was paid in the simulated flow: no real money exists
     *                     ({@code SellerSettlements.IsSandbox}, copied from the payment and immutable)
     * @param payoutRecordType for RELEASED settlements: SIMULATED_RECORD (sandbox — an admin recorded a reference, no
     *                     money was transferred) or EXTERNAL_TRANSFER_CONFIRMED (an admin confirmed a real transfer
     *                     made outside UniMarket); null while PENDING
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Settlement(long orderId, Ref seller, String status, long amount, long merchandiseSubtotal, long commission,
                             long shippingFee, boolean sandbox, boolean onHold, Instant createdAt, Instant releasedAt, Ref releasedBy,
                             String payoutReference, String payoutNote, String payoutRecordType, String calculation,
                             long orderSellerPayout) {
    }

    /**
     * @param payoutReference      reference of the transfer made outside UniMarket (or, for sandbox, of the simulated record)
     * @param note                 optional (at most 400 characters)
     * @param acknowledgeSimulated must be true to release a SANDBOX settlement: the admin confirms it is only a
     *                             simulated record and no money moves
     */
    public record ReleaseRequest(@NotBlank @Size(max = 100) String payoutReference, @Size(max = 400) String note, Boolean acknowledgeSimulated) {
    }

    // ------------------------------------------------------------------ dashboard

    /**
     * Read-only figures from the database. Money in VND. {@code period} applies to completed orders (CompletedAt),
     * released payouts (ReleasedAt) and paid promotions (StartsAt); the other figures are current snapshots.
     */
    public record Dashboard(Period period, Map<String, Long> users, Map<String, Long> listings, Map<String, Long> orders,
                            Finance finance, Map<String, Long> settlements, Map<String, Long> disputes, Map<String, Long> reports,
                            Map<String, Long> promotions) {
    }

    /** @param from inclusive (UTC), null = no lower bound; @param to exclusive (UTC), null = now */
    public record Period(Instant from, Instant to) {
    }

    /**
     * Completed orders in the period. Platform revenue is the commission only: the buyer total includes the
     * merchandise and the delivery fee, which belongs to the seller (D1).
     *
     * @param sandboxOrders completed orders paid with simulated payments (no real money)
     */
    public record Finance(long completedOrders, long grossMerchandiseValue, long shippingFees, long buyerPaidTotal,
                          long commissionRevenue, long sellerPayoutTotal, long sandboxOrders) {
    }
}
