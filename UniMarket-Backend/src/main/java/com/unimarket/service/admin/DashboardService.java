package com.unimarket.service.admin;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.exception.ValidationException;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Types;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only admin figures computed from the database (no sample data).
 *
 * <ul>
 *   <li>Money comes from the {@code Orders} computed columns only (one row per order, no join with
 *       {@code OrderItems}, so nothing is counted twice).</li>
 *   <li>Platform revenue = commission ({@code CommissionAmount}). The buyer total and the delivery fee are reported
 *       separately: the delivery fee belongs to the seller (D1) and is never commission.</li>
 *   <li>Period: {@code from}/{@code to} are UTC dates; {@code to} is inclusive as a date (the filter is
 *       {@code >= from 00:00} and {@code < to+1 00:00}), matching the UTC {@code SYSUTCDATETIME()} values.</li>
 * </ul>
 */
@Service
@Profile("!nodb")
public class DashboardService {

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public DashboardService(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * @param from first UTC day (inclusive) or null
     * @param to   last UTC day (inclusive) or null
     */
    public AdminDtos.Dashboard dashboard(LocalDate from, LocalDate to) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("to", "must not be before from")));
        }
        LocalDateTime start = from == null ? null : from.atStartOfDay();
        LocalDateTime end = to == null ? null : to.plusDays(1).atStartOfDay();
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("from", start, Types.TIMESTAMP).addValue("to", end, Types.TIMESTAMP);
        String inPeriod = "(:from IS NULL OR %1$s >= :from) AND (:to IS NULL OR %1$s < :to)";

        Map<String, Long> users = row("""
                SELECT SUM(CASE WHEN Role = 'Student' THEN 1 ELSE 0 END) AS students,
                       SUM(CASE WHEN Role = 'Admin' THEN 1 ELSE 0 END) AS admins,
                       SUM(CASE WHEN Role = 'Student' AND Status = 'Active' THEN 1 ELSE 0 END) AS activeStudents,
                       SUM(CASE WHEN Status = 'Suspended' THEN 1 ELSE 0 END) AS suspended,
                       SUM(CASE WHEN Status = 'Closed' THEN 1 ELSE 0 END) AS closed,
                       SUM(CASE WHEN Role = 'Student' AND EmailVerifiedAt IS NOT NULL THEN 1 ELSE 0 END) AS studentAccountsWithEmailVerified,
                       SUM(CASE WHEN Role = 'Student' AND """ + inPeriod.formatted("CreatedAt") + " THEN 1 ELSE 0 END) AS newStudentsInPeriod FROM dbo.Users", p);
        Map<String, Long> listings = row("""
                SELECT SUM(CASE WHEN Status = 'Available' AND ModerationStatus = 'Approved' THEN 1 ELSE 0 END) AS publicAvailable,
                       SUM(CASE WHEN ModerationStatus = 'Pending' THEN 1 ELSE 0 END) AS pendingModeration,
                       SUM(CASE WHEN ModerationStatus = 'Rejected' THEN 1 ELSE 0 END) AS blocked,
                       SUM(CASE WHEN Status = 'Reserved' THEN 1 ELSE 0 END) AS reserved,
                       SUM(CASE WHEN Status = 'Sold' THEN 1 ELSE 0 END) AS sold,
                       SUM(CASE WHEN Status = 'Removed' THEN 1 ELSE 0 END) AS removed,
                       SUM(CASE WHEN Status = 'Draft' THEN 1 ELSE 0 END) AS draft
                FROM dbo.Products""", p);
        Map<String, Long> orders = row("""
                SELECT SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS pending,
                       SUM(CASE WHEN Status = 'AwaitingPayment' THEN 1 ELSE 0 END) AS awaitingPayment,
                       SUM(CASE WHEN Status = 'Paid' THEN 1 ELSE 0 END) AS paid,
                       SUM(CASE WHEN Status = 'Delivering' THEN 1 ELSE 0 END) AS delivering,
                       SUM(CASE WHEN Status = 'Completed' THEN 1 ELSE 0 END) AS completed,
                       SUM(CASE WHEN Status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled,
                       SUM(CASE WHEN """ + inPeriod.formatted("CreatedAt") + " THEN 1 ELSE 0 END) AS placedInPeriod FROM dbo.Orders", p);
        Map<String, Long> money = row("""
                SELECT COUNT(*) AS completedOrders, SUM(Subtotal) AS gmv, SUM(ShippingFee) AS shipping, SUM(TotalAmount) AS buyerTotal,
                       SUM(CommissionAmount) AS commission, SUM(SellerPayoutTotal) AS payout,
                       SUM(CASE WHEN realPay.Paid IS NULL THEN 1 ELSE 0 END) AS sandboxOrders
                FROM dbo.Orders o
                -- at most one row per order: no double counting
                OUTER APPLY (SELECT TOP (1) 1 AS Paid FROM dbo.Payments pay
                             WHERE pay.OrderId = o.OrderId AND pay.Status = 'Succeeded' AND pay.IsSandbox = 0) realPay
                WHERE o.Status = 'Completed' AND """ + inPeriod.formatted("o.CompletedAt"), p);
        AdminDtos.Finance finance = new AdminDtos.Finance(money.get("completedOrders"), money.get("gmv"), money.get("shipping"),
                money.get("buyerTotal"), money.get("commission"), money.get("payout"), money.get("sandboxOrders"));
        Map<String, Long> settlements = row("""
                SELECT SUM(CASE WHEN s.Status = 'Pending' THEN 1 ELSE 0 END) AS pendingCount,
                       SUM(CASE WHEN s.Status = 'Pending' THEN s.Amount ELSE 0 END) AS pendingAmount,
                       SUM(CASE WHEN s.Status = 'Pending' AND s.IsSandbox = 1 THEN s.Amount ELSE 0 END) AS pendingSandboxAmount,
                       SUM(CASE WHEN s.Status = 'Pending' AND hold.OnHold = 1 THEN 1 ELSE 0 END) AS onHoldCount,
                       SUM(CASE WHEN s.Status = 'Released' AND """ + inPeriod.formatted("s.ReleasedAt") + """
                                THEN 1 ELSE 0 END) AS releasedInPeriodCount,
                       -- real transfers confirmed by an admin vs. simulated (sandbox) payout records: never added together
                       SUM(CASE WHEN s.Status = 'Released' AND s.IsSandbox = 0 AND """ + inPeriod.formatted("s.ReleasedAt") + """
                                THEN s.Amount ELSE 0 END) AS releasedRealAmountInPeriod,
                       SUM(CASE WHEN s.Status = 'Released' AND s.IsSandbox = 1 AND """ + inPeriod.formatted("s.ReleasedAt") + """
                                THEN s.Amount ELSE 0 END) AS releasedSandboxAmountInPeriod
                FROM dbo.SellerSettlements s
                OUTER APPLY (SELECT TOP (1) 1 AS OnHold FROM dbo.OrderDisputes h
                             WHERE h.OrderId = s.OrderId AND (h.Status = 'Open' OR h.Decision = 'RefundApproved')) hold""", p);
        Map<String, Long> disputes = row("""
                SELECT SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS [open],
                       SUM(CASE WHEN Decision = 'RefundApproved' AND RefundConfirmedAt IS NULL THEN 1 ELSE 0 END) AS refundApprovedAwaitingConfirmation
                FROM dbo.OrderDisputes""", p);
        Map<String, Long> reports = row("""
                SELECT SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS [open],
                       SUM(CASE WHEN Status = 'Reviewing' THEN 1 ELSE 0 END) AS reviewing
                FROM dbo.Reports""", p);
        Map<String, Long> promotions = row("""
                SELECT SUM(CASE WHEN Status = 'Paid' AND StartsAt <= SYSUTCDATETIME() AND EndsAt > SYSUTCDATETIME() THEN 1 ELSE 0 END) AS activePaid,
                       SUM(CASE WHEN Status = 'Paid' AND """ + inPeriod.formatted("StartsAt") + """
                                THEN 1 ELSE 0 END) AS paidInPeriod,
                       SUM(CASE WHEN Status = 'Paid' AND """ + inPeriod.formatted("StartsAt") + """
                                THEN Amount ELSE 0 END) AS paidRevenueInPeriod,
                       SUM(CASE WHEN Status = 'Paid' AND IsSandbox = 1 AND """ + inPeriod.formatted("StartsAt") + """
                                THEN 1 ELSE 0 END) AS sandboxPaidInPeriod
                FROM dbo.ProductPromotions""", p);
        return new AdminDtos.Dashboard(new AdminDtos.Period(start == null ? null : start.toInstant(ZoneOffset.UTC),
                (end == null ? LocalDateTime.now(clock) : end).toInstant(ZoneOffset.UTC)),
                users, listings, orders, finance, settlements, disputes, reports, promotions);
    }

    /** What needs an admin now (sidebar badges). */
    public Map<String, Long> badges() {
        return row("""
                SELECT (SELECT COUNT(*) FROM dbo.Products WHERE ModerationStatus = 'Pending') AS pendingListings,
                       (SELECT COUNT(*) FROM dbo.Reports WHERE Status IN ('Open', 'Reviewing')) AS openReports,
                       (SELECT COUNT(*) FROM dbo.OrderDisputes WHERE Status = 'Open') AS openDisputes,
                       (SELECT COUNT(*) FROM dbo.SellerSettlements WHERE Status = 'Pending') AS pendingSettlements""", new MapSqlParameterSource());
    }

    /** One row of aggregates; NULL sums (empty sets) become 0. */
    private Map<String, Long> row(String sql, MapSqlParameterSource params) {
        return jdbc.queryForObject(sql, params, (rs, i) -> {
            Map<String, Long> values = new LinkedHashMap<>();
            for (int c = 1; c <= rs.getMetaData().getColumnCount(); c++) {
                java.math.BigDecimal value = rs.getBigDecimal(c);
                values.put(rs.getMetaData().getColumnLabel(c), value == null ? 0L : value.longValueExact());
            }
            return values;
        });
    }
}
