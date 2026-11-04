package com.unimarket.controller;

import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.admin.AdminFinanceService;
import com.unimarket.service.admin.AdminUserService;
import com.unimarket.service.admin.DashboardService;
import com.unimarket.service.admin.ModerationService;
import com.unimarket.service.admin.ReportService;
import com.unimarket.dto.chat.ChatDtos;
import com.unimarket.service.chat.ChatService;
import com.unimarket.service.order.OrderService;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Admin API (Backend Stage 5). Every path is under {@code /api/admin/**}, which {@code SecurityConfig} restricts to
 * accounts with {@code Users.Role = 'Admin'} (403 for students, 401 without a token). The acting admin always comes
 * from the token. See {@code docs/ADMIN_API.md}.
 */
@RestController
@Profile("!nodb")
@RequestMapping("/api/admin")
public class AdminController {

    private final DashboardService dashboard;
    private final ModerationService moderation;
    private final AdminUserService users;
    private final ReportService reports;
    private final AdminFinanceService finance;
    private final OrderService orders;
    private final ChatService chat;

    public AdminController(DashboardService dashboard, ModerationService moderation, AdminUserService users, ReportService reports,
                           AdminFinanceService finance, OrderService orders, ChatService chat) {
        this.dashboard = dashboard;
        this.moderation = moderation;
        this.users = users;
        this.reports = reports;
        this.finance = finance;
        this.orders = orders;
        this.chat = chat;
    }

    // ------------------------------------------------------------------ dashboard

    /** Figures from the database; optional UTC date range (inclusive days) for period figures. */
    @GetMapping("/dashboard")
    public AdminDtos.Dashboard dashboard(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboard.dashboard(from, to);
    }

    /** What needs attention: pending listings, open reports, open disputes, pending settlements. */
    @GetMapping("/badges")
    public Map<String, Long> badges() {
        return dashboard.badges();
    }

    // ------------------------------------------------------------------ listings

    @GetMapping("/listings")
    public PageResponse<AdminDtos.Listing> listings(@RequestParam(required = false) String moderation, @RequestParam(required = false) String q,
                                                    @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return this.moderation.list(moderation, q, page, size);
    }

    @GetMapping("/listings/counts")
    public Map<String, Long> listingCounts() {
        return moderation.counts();
    }

    @GetMapping("/listings/{id}")
    public AdminDtos.Listing listing(@PathVariable int id) {
        return moderation.detail(id);
    }

    /** Pending → approved, for the version reviewed (409 LISTING_CHANGED if the seller edited it meanwhile). */
    @PostMapping("/listings/{id}/approve")
    public AdminDtos.Listing approve(@PathVariable int id, @Valid @RequestBody AdminDtos.ApproveRequest request,
                                     @AuthenticationPrincipal AuthenticatedUser admin) {
        return moderation.approve(id, request.version(), request.note(), admin);
    }

    /** Pending → blocked with a reason shown to the seller, for the version reviewed. */
    @PostMapping("/listings/{id}/reject")
    public AdminDtos.Listing reject(@PathVariable int id, @Valid @RequestBody AdminDtos.RejectRequest request,
                                    @AuthenticationPrincipal AuthenticatedUser admin) {
        return moderation.reject(id, request.version(), request.reason(), admin);
    }

    /** Approved → blocked (hidden) with a reason. */
    @PostMapping("/listings/{id}/block")
    public AdminDtos.Listing block(@PathVariable int id, @RequestBody AdminDtos.ReasonRequest request, @AuthenticationPrincipal AuthenticatedUser admin) {
        return moderation.block(id, request.reason(), admin);
    }

    /** Draft / Available → Removed (soft) with a reason. */
    @PostMapping("/listings/{id}/remove")
    public AdminDtos.Listing remove(@PathVariable int id, @RequestBody AdminDtos.ReasonRequest request, @AuthenticationPrincipal AuthenticatedUser admin) {
        return moderation.remove(id, request.reason(), admin);
    }

    // ------------------------------------------------------------------ users

    @GetMapping("/users")
    public PageResponse<AdminDtos.User> users(@RequestParam(required = false) String q, @RequestParam(required = false) String status,
                                              @RequestParam(required = false) String role, @RequestParam(defaultValue = "1") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return users.list(q, status, role, page, size);
    }

    @GetMapping("/users/{id}")
    public AdminDtos.User user(@PathVariable int id) {
        return users.detail(id);
    }

    /** Private phone / Zalo for support, moderation or disputes: purpose required, every access audited. */
    @PostMapping("/users/{id}/contact-access")
    public AdminUserService.ContactAccess contactAccess(@PathVariable int id, @RequestBody AdminDtos.PurposeRequest request,
                                                       @AuthenticationPrincipal AuthenticatedUser admin) {
        return users.privateContact(id, request.purpose(), admin);
    }

    @PostMapping("/users/{id}/suspend")
    public AdminDtos.User suspend(@PathVariable int id, @RequestBody AdminDtos.ReasonRequest request, @AuthenticationPrincipal AuthenticatedUser admin) {
        return users.suspend(id, request.reason(), admin);
    }

    @PostMapping("/users/{id}/reactivate")
    public AdminDtos.User reactivate(@PathVariable int id, @RequestBody(required = false) AdminDtos.ReasonRequest request,
                                     @AuthenticationPrincipal AuthenticatedUser admin) {
        return users.reactivate(id, request == null ? null : request.reason(), admin);
    }

    // ------------------------------------------------------------------ orders (read only)

    @GetMapping("/orders")
    public PageResponse<OrderResponse> orders(@RequestParam(name = "status", required = false) List<String> status,
                                              @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size,
                                              @AuthenticationPrincipal AuthenticatedUser admin) {
        com.unimarket.service.admin.AdminSupport.requirePage(page, size);
        List<String> statuses = status == null ? List.of()
                : status.stream().flatMap(s -> Arrays.stream(s.split(","))).map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        return orders.listAll(admin, statuses, page, size);
    }

    @GetMapping("/orders/{id}")
    public OrderResponse order(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser admin) {
        return orders.detail(id, admin);
    }

    // ------------------------------------------------------------------ reports

    @GetMapping("/reports")
    public PageResponse<AdminDtos.Report> reports(@RequestParam(required = false) String status, @RequestParam(required = false) String targetType,
                                                  @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return reports.list(status, targetType, page, size);
    }

    @GetMapping("/reports/{id}")
    public AdminDtos.Report report(@PathVariable long id) {
        return reports.detail(id);
    }

    @PostMapping("/reports/{id}/review")
    public AdminDtos.Report startReview(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser admin) {
        return reports.startReview(id, admin);
    }

    @PostMapping("/reports/{id}/resolve")
    public AdminDtos.Report resolve(@PathVariable long id, @RequestBody AdminDtos.ResolutionRequest request,
                                    @AuthenticationPrincipal AuthenticatedUser admin) {
        return reports.decide(id, true, request.resolution(), admin);
    }

    @PostMapping("/reports/{id}/dismiss")
    public AdminDtos.Report dismiss(@PathVariable long id, @RequestBody AdminDtos.ResolutionRequest request,
                                    @AuthenticationPrincipal AuthenticatedUser admin) {
        return reports.decide(id, false, request.resolution(), admin);
    }

    /** A reported conversation with all messages (404 when it was never reported). Each read is audited. */
    @GetMapping("/conversations/{id}")
    public ChatDtos.AdminConversation conversation(@PathVariable int id, @AuthenticationPrincipal AuthenticatedUser admin) {
        return chat.adminView(id, admin);
    }

    // ------------------------------------------------------------------ disputes (D3)

    @GetMapping("/disputes")
    public PageResponse<AdminDtos.Dispute> disputes(@RequestParam(required = false) String status, @RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        return finance.disputes(status, page, size);
    }

    @GetMapping("/disputes/{id}")
    public AdminDtos.Dispute dispute(@PathVariable long id) {
        return finance.dispute(id);
    }

    /** Records the decision (NO_REFUND / REFUND_APPROVED). Executes no refund. */
    @PostMapping("/disputes/{id}/resolve")
    public AdminDtos.Dispute resolveDispute(@PathVariable long id, @Valid @RequestBody AdminDtos.ResolveDisputeRequest request,
                                            @AuthenticationPrincipal AuthenticatedUser admin) {
        return finance.resolve(id, request.decision(), request.resolution(), admin);
    }

    /** Records the reference of an approved refund that was made outside UniMarket. */
    @PostMapping("/disputes/{id}/confirm-refund")
    public AdminDtos.Dispute confirmRefund(@PathVariable long id, @Valid @RequestBody AdminDtos.RefundConfirmationRequest request,
                                           @AuthenticationPrincipal AuthenticatedUser admin) {
        return finance.confirmRefund(id, request.refundReference(), admin);
    }

    // ------------------------------------------------------------------ settlements (D6)

    @GetMapping("/settlements")
    public PageResponse<AdminDtos.Settlement> settlements(@RequestParam(required = false) String status, @RequestParam(required = false) Boolean onHold,
                                                          @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return finance.settlements(status, onHold, page, size);
    }

    @GetMapping("/settlements/{orderId}")
    public AdminDtos.Settlement settlement(@PathVariable long orderId) {
        return finance.settlement(orderId);
    }

    /** Records that the seller was paid outside UniMarket (transfer reference). Moves no money. */
    @PostMapping("/settlements/{orderId}/release")
    public AdminDtos.Settlement release(@PathVariable long orderId, @Valid @RequestBody AdminDtos.ReleaseRequest request,
                                        @AuthenticationPrincipal AuthenticatedUser admin) {
        return finance.release(orderId, request.payoutReference(), request.note(), request.acknowledgeSimulated(), admin);
    }
}
