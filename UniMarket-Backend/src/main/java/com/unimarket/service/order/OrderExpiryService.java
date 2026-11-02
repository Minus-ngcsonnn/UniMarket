package com.unimarket.service.order;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Expires overdue orders with {@code usp_ExpirePendingOrders} (D2). All rules and times live in the database
 * ({@code SYSUTCDATETIME()}, {@code ConfirmBy}, {@code PaymentDueAt}, 30-minute grace); Java passes no time.
 *
 * <ul>
 *   <li>Pending + ConfirmBy passed (seller did not confirm within 24 h of the order) → Cancelled.</li>
 *   <li>AwaitingPayment + PaymentDueAt passed (buyer did not pay within 24 h of the confirmation) → Cancelled,
 *       except while a payment attempt is still pending inside the 30-minute grace window; after the grace window
 *       the unanswered attempt is closed as Expired.</li>
 *   <li>Every listing of an expired order goes back from Reserved to Available.</li>
 * </ul>
 * Running it again is safe: an order is only expired once, and Paid / Delivering / Completed orders are never touched.
 */
@Service
@Profile("!nodb")
public class OrderExpiryService {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryService.class);

    private final OrderProcedures procedures;

    public OrderExpiryService(OrderProcedures procedures) {
        this.procedures = procedures;
    }

    /** Says at startup whether the expiry job runs, so a disabled job is never a silent surprise. */
    @org.springframework.beans.factory.annotation.Autowired
    void reportSchedule(@org.springframework.beans.factory.annotation.Value("${unimarket.orders.expiry.enabled}") boolean enabled,
                        @org.springframework.beans.factory.annotation.Value("${unimarket.orders.expiry.interval}") String interval) {
        if (enabled) {
            log.info("Order expiry job is ON (every {}): overdue orders are cancelled and their listings released", interval);
        } else {
            log.warn("Order expiry job is OFF (ORDER_EXPIRY_ENABLED=false): overdue orders stay reserved until it is enabled. "
                    + "Enable it in production.");
        }
    }

    /** @return the orders expired by this run */
    public List<OrderProcedures.Expired> expireOverdueOrders() {
        List<OrderProcedures.Expired> expired = procedures.expirePendingOrders();
        if (!expired.isEmpty()) {
            log.info("Expired {} overdue order(s): {}", expired.size(), expired);
        }
        return expired;
    }
}
