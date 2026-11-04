package com.unimarket.service.admin;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.order.SettlementCalculation;
import com.unimarket.service.order.SqlErrors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Admin handling of order disputes (D3) and seller settlements (D1, D4, D6). Every change is one V002 procedure:
 * {@code usp_ResolveOrderDispute}, {@code usp_ConfirmDisputeRefund}, {@code usp_MarkSettlementReleased}. They check
 * the admin, the state and the dispute hold, and write {@code AdminActions}.
 *
 * <p>Nothing here moves money. A REFUND_APPROVED decision is a decision only; a refund or payout is recorded only when
 * an admin enters the reference of a transfer that was made OUTSIDE UniMarket. For sandbox (simulated) orders no real
 * money exists, which every response states ({@code sandbox}).</p>
 */
@Service
@Profile("!nodb")
public class AdminFinanceService {

    private static final Logger log = LoggerFactory.getLogger(AdminFinanceService.class);
    /** Prefix of the payout note of a sandbox settlement (stored in PayoutNote and in the AdminActions reason). */
    public static final String SANDBOX_NOTE = "[SANDBOX] Simulated payout record - no money was transferred.";

    private final NamedParameterJdbcTemplate named;
    private final JdbcTemplate jdbc;

    public AdminFinanceService(NamedParameterJdbcTemplate named, JdbcTemplate jdbc) {
        this.named = named;
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ disputes

    /** @param status OPEN (default), RESOLVED or ALL; oldest first */
    public PageResponse<AdminDtos.Dispute> disputes(String status, int page, int size) {
        AdminSupport.requirePage(page, size);
        List<String> statuses = switch (status == null || status.isBlank() ? "OPEN" : status.trim().toUpperCase(Locale.ROOT)) {
            case "OPEN" -> List.of("Open");
            case "RESOLVED" -> List.of("Resolved");
            case "ALL" -> List.of("Open", "Resolved");
            default -> throw invalid("status", "must be OPEN, RESOLVED or ALL");
        };
        MapSqlParameterSource params = new MapSqlParameterSource("statuses", statuses).addValue("offset", (page - 1) * size).addValue("limit", size);
        Long total = named.queryForObject("SELECT COUNT(*) FROM dbo.OrderDisputes d WHERE d.Status IN (:statuses)", params, Long.class);
        List<AdminDtos.Dispute> items = named.query(DISPUTE_SQL + " WHERE d.Status IN (:statuses) ORDER BY d.CreatedAt, d.DisputeId "
                + "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY", params, AdminFinanceService::dispute);
        long count = total == null ? 0 : total;
        return new PageResponse<>(items, page, size, count, (int) ((count + size - 1) / size), null);
    }

    public AdminDtos.Dispute dispute(long disputeId) {
        return named.query(DISPUTE_SQL + " WHERE d.DisputeId = :id", Map.of("id", disputeId), AdminFinanceService::dispute)
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Dispute not found."));
    }

    /** Disputes of orders the user takes part in (opened by either side), newest first. */
    public List<AdminDtos.Dispute> disputesOf(AuthenticatedUser user) {
        return named.query(DISPUTE_SQL + " WHERE o.BuyerId = :me OR o.SellerId = :me ORDER BY d.CreatedAt DESC, d.DisputeId DESC",
                Map.of("me", user.id()), AdminFinanceService::dispute).stream()
                .map(d -> new AdminDtos.Dispute(d.id(), d.orderId(), d.orderStatus(), d.openedBy(), null, d.buyer(), d.seller(), d.reason(),
                        d.status(), d.decision(), d.resolution(), null, d.createdAt(), d.resolvedAt(), null, d.refundConfirmedAt(),
                        d.orderTotal(), d.sandbox()))
                .toList();
    }

    /** Open → Resolved with NO_REFUND or REFUND_APPROVED. A decision only: no refund is executed. */
    public AdminDtos.Dispute resolve(long disputeId, String decision, String resolution, AuthenticatedUser admin) {
        String decisionSql = switch (decision == null ? "" : decision.trim().toUpperCase(Locale.ROOT)) {
            case "NO_REFUND" -> "NoRefund";
            case "REFUND_APPROVED" -> "RefundApproved";
            default -> throw invalid("decision", "must be NO_REFUND or REFUND_APPROVED");
        };
        String text = AdminSupport.requireReason(resolution, "resolution", 2000);
        try {
            jdbc.update("EXEC dbo.usp_ResolveOrderDispute @DisputeId = ?, @AdminId = ?, @Decision = ?, @Resolution = ?",
                    disputeId, admin.id(), decisionSql, text);
        } catch (DataAccessException ex) {
            throw switch (SqlErrors.numberOf(ex)) {
                case 51034 -> new ApiException(ErrorCode.ACCESS_DENIED);
                case 51035 -> invalid("resolution", "choose a decision and explain it");
                case 51036 -> notFoundOr(disputeId, new ApiException(ErrorCode.DISPUTE_STATE_CONFLICT, "This dispute has already been resolved."));
                default -> ex;
            };
        }
        log.info("Dispute {} resolved ({}) by admin {}", disputeId, decisionSql, admin.id());
        return dispute(disputeId);
    }

    /** Records that an APPROVED refund really happened outside UniMarket, with its reference. Once only. */
    public AdminDtos.Dispute confirmRefund(long disputeId, String reference, AuthenticatedUser admin) {
        try {
            jdbc.update("EXEC dbo.usp_ConfirmDisputeRefund @DisputeId = ?, @AdminId = ?, @RefundReference = ?", disputeId, admin.id(), reference);
        } catch (DataAccessException ex) {
            throw switch (SqlErrors.numberOf(ex)) {
                case 51034 -> new ApiException(ErrorCode.ACCESS_DENIED);
                case 51037 -> invalid("refundReference", "enter the reference of the completed refund");
                case 51038 -> notFoundOr(disputeId, new ApiException(ErrorCode.DISPUTE_STATE_CONFLICT,
                        "Only an approved refund that is not confirmed yet can be confirmed."));
                default -> ex;
            };
        }
        log.info("Refund of dispute {} confirmed by admin {}", disputeId, admin.id());
        return dispute(disputeId);
    }

    // ------------------------------------------------------------------ settlements

    /** @param status PENDING (default), RELEASED or ALL; @param onHold optional filter on the dispute hold */
    public PageResponse<AdminDtos.Settlement> settlements(String status, Boolean onHold, int page, int size) {
        AdminSupport.requirePage(page, size);
        List<String> statuses = switch (status == null || status.isBlank() ? "PENDING" : status.trim().toUpperCase(Locale.ROOT)) {
            case "PENDING" -> List.of("Pending");
            case "RELEASED" -> List.of("Released");
            case "ALL" -> List.of("Pending", "Released");
            default -> throw invalid("status", "must be PENDING, RELEASED or ALL");
        };
        MapSqlParameterSource params = new MapSqlParameterSource("statuses", statuses).addValue("offset", (page - 1) * size)
                .addValue("limit", size).addValue("hold", onHold == null ? -1 : (onHold ? 1 : 0));
        String where = " WHERE s.Status IN (:statuses) AND (:hold = -1 OR " + HOLD + " = :hold)";
        Long total = named.queryForObject("SELECT COUNT(*) FROM dbo.SellerSettlements s" + where, params, Long.class);
        List<AdminDtos.Settlement> items = named.query(SETTLEMENT_SQL + where + " ORDER BY s.CreatedAt, s.OrderId OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY",
                params, AdminFinanceService::settlement);
        long count = total == null ? 0 : total;
        return new PageResponse<>(items, page, size, count, (int) ((count + size - 1) / size), null);
    }

    public AdminDtos.Settlement settlement(long orderId) {
        return named.query(SETTLEMENT_SQL + " WHERE s.OrderId = :id", Map.of("id", orderId), AdminFinanceService::settlement)
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Settlement not found."));
    }

    /**
     * Records that the seller was paid OUTSIDE UniMarket (D6), with the transfer reference. Refused while a dispute is
     * open or a refund was approved (51042), and only once (Pending → Released, then final).
     */
    public AdminDtos.Settlement release(long orderId, String payoutReference, String note, Boolean acknowledgeSimulated,
                                        AuthenticatedUser admin) {
        AdminDtos.Settlement current = settlement(orderId);
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        if (current.sandbox()) {
            // Sandbox: the admin must confirm it is only a record, and the record says so in PayoutNote and in the
            // AdminActions row written by usp_MarkSettlementReleased (it includes the note).
            if (!Boolean.TRUE.equals(acknowledgeSimulated)) {
                throw invalid("acknowledgeSimulated", "must be true: this settlement belongs to a simulated (sandbox) order; no money is transferred");
            }
            cleanNote = SANDBOX_NOTE + (cleanNote == null ? "" : " " + cleanNote);
        }
        try {
            jdbc.update("EXEC dbo.usp_MarkSettlementReleased @OrderId = ?, @AdminId = ?, @PayoutReference = ?, @Note = ?",
                    orderId, admin.id(), payoutReference, cleanNote);
        } catch (DataAccessException ex) {
            throw switch (SqlErrors.numberOf(ex)) {
                case 51040, 51045 -> new ApiException(ErrorCode.ACCESS_DENIED);
                case 51041 -> invalid("payoutReference", "enter the reference of the payout transfer");
                case 51017, 51044 -> new ApiException(ErrorCode.SETTLEMENT_STATE_CONFLICT);
                case 51042 -> new ApiException(ErrorCode.SETTLEMENT_ON_HOLD);
                default -> ex;
            };
        }
        log.info("Settlement of order {} marked released by admin {}", orderId, admin.id());
        return settlement(orderId);
    }

    // ------------------------------------------------------------------ helpers

    private ApiException notFoundOr(long disputeId, ApiException conflict) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderDisputes WHERE DisputeId = ?", Integer.class, disputeId);
        return n != null && n > 0 ? conflict : new ApiException(ErrorCode.NOT_FOUND, "Dispute not found.");
    }

    private static ValidationException invalid(String field, String message) {
        return new ValidationException(List.of(new ApiErrorResponse.FieldError(field, message)));
    }

    /** 1 while the payout is on hold: open dispute or approved refund on the order (same rule as usp_MarkSettlementReleased). */
    private static final String HOLD = "(CASE WHEN EXISTS (SELECT 1 FROM dbo.OrderDisputes h WHERE h.OrderId = s.OrderId "
            + "AND (h.Status = 'Open' OR h.Decision = 'RefundApproved')) THEN 1 ELSE 0 END)";

    private static final String SETTLEMENT_SQL = """
            SELECT s.OrderId, s.SellerId, u.FullName AS SellerName, s.Status, s.Amount, s.MerchandiseSubtotal, s.CommissionAmount,
                   s.ShippingFee, s.IsSandbox, s.CreatedAt, s.ReleasedAt, s.ReleasedBy, a.FullName AS ReleasedByName, s.PayoutReference,
                   s.PayoutNote, %s AS OnHold, %s AS LegacyCalculation, o.SellerPayoutTotal
            FROM dbo.SellerSettlements s
            JOIN dbo.Orders o ON o.OrderId = s.OrderId
            JOIN dbo.Users u ON u.UserId = s.SellerId
            LEFT JOIN dbo.Users a ON a.UserId = s.ReleasedBy
            """.formatted(HOLD, SettlementCalculation.LEGACY_SQL);

    private static final String DISPUTE_SQL = """
            SELECT d.DisputeId, d.OrderId, o.Status AS OrderStatus, o.BuyerId, b.FullName AS BuyerName, o.SellerId, s.FullName AS SellerName,
                   d.OpenedBy, op.FullName AS OpenerName, d.Reason, d.Status, d.Decision, d.Resolution, d.ResolvedBy, rb.FullName AS ResolverName,
                   d.CreatedAt, d.ResolvedAt, d.RefundReference, d.RefundConfirmedAt, o.TotalAmount,
                   CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.OrderId = o.OrderId AND p.Status = 'Succeeded' AND p.IsSandbox = 0)
                        THEN 0 ELSE 1 END AS bit) AS Sandbox
            FROM dbo.OrderDisputes d
            JOIN dbo.Orders o ON o.OrderId = d.OrderId
            JOIN dbo.Users b ON b.UserId = o.BuyerId
            JOIN dbo.Users s ON s.UserId = o.SellerId
            JOIN dbo.Users op ON op.UserId = d.OpenedBy
            LEFT JOIN dbo.Users rb ON rb.UserId = d.ResolvedBy
            """;

    private static AdminDtos.Dispute dispute(ResultSet rs, int rowNum) throws SQLException {
        int opener = rs.getInt("OpenedBy");
        Integer resolver = (Integer) rs.getObject("ResolvedBy");
        return new AdminDtos.Dispute(rs.getLong("DisputeId"), rs.getLong("OrderId"), OrderValues.orderStatus(rs.getString("OrderStatus")),
                opener == rs.getInt("BuyerId") ? "BUYER" : "SELLER", new AdminDtos.Ref(opener, rs.getString("OpenerName")),
                new AdminDtos.Ref(rs.getInt("BuyerId"), rs.getString("BuyerName")), new AdminDtos.Ref(rs.getInt("SellerId"), rs.getString("SellerName")),
                rs.getString("Reason"), OrderValues.upper(rs.getString("Status")), OrderValues.upper(rs.getString("Decision")),
                rs.getString("Resolution"), resolver == null ? null : new AdminDtos.Ref(resolver, rs.getString("ResolverName")),
                ModerationService.utc(rs, "CreatedAt"), ModerationService.utc(rs, "ResolvedAt"), rs.getString("RefundReference"),
                ModerationService.utc(rs, "RefundConfirmedAt"), rs.getBigDecimal("TotalAmount").longValueExact(), rs.getBoolean("Sandbox"));
    }

    private static AdminDtos.Settlement settlement(ResultSet rs, int rowNum) throws SQLException {
        Integer releasedBy = (Integer) rs.getObject("ReleasedBy");
        return new AdminDtos.Settlement(rs.getLong("OrderId"), new AdminDtos.Ref(rs.getInt("SellerId"), rs.getString("SellerName")),
                OrderValues.upper(rs.getString("Status")), rs.getBigDecimal("Amount").longValueExact(),
                rs.getBigDecimal("MerchandiseSubtotal").longValueExact(), rs.getBigDecimal("CommissionAmount").longValueExact(),
                rs.getBigDecimal("ShippingFee").longValueExact(), rs.getBoolean("IsSandbox"), rs.getInt("OnHold") == 1,
                ModerationService.utc(rs, "CreatedAt"), ModerationService.utc(rs, "ReleasedAt"),
                releasedBy == null ? null : new AdminDtos.Ref(releasedBy, rs.getString("ReleasedByName")),
                rs.getString("PayoutReference"), rs.getString("PayoutNote"),
                !"Released".equals(rs.getString("Status")) ? null
                        : rs.getBoolean("IsSandbox") ? "SIMULATED_RECORD" : "EXTERNAL_TRANSFER_CONFIRMED",
                SettlementCalculation.of(rs.getBoolean("LegacyCalculation")), rs.getBigDecimal("SellerPayoutTotal").longValueExact());
    }
}
