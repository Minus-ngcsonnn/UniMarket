package com.unimarket.config;

import com.unimarket.service.order.OrderExpiryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Runs the order expiry about once a minute ({@code unimarket.orders.expiry.*}, env {@code ORDER_EXPIRY_ENABLED},
 * {@code ORDER_EXPIRY_INTERVAL}).
 *
 * <ul>
 *   <li>Fixed delay: a run never overlaps the previous one in this instance. Several instances are safe too: the
 *       procedure locks the candidate rows and an order can only be expired once.</li>
 *   <li>A failed run is logged and changes nothing (the procedure is all-or-nothing); the next run tries again.</li>
 *   <li>After a restart, or when the scheduler was off, the first run expires everything that is overdue, because
 *       deadlines are stored in the database. While it is off, overdue orders stay reserved, and the procedures still
 *       refuse late confirmations (51007) and late payment starts (51024).</li>
 * </ul>
 */
@Configuration
@EnableScheduling
@Profile("!nodb")
@ConditionalOnProperty(name = "unimarket.orders.expiry.enabled", havingValue = "true")
public class OrderExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryScheduler.class);

    private final OrderExpiryService expiry;

    public OrderExpiryScheduler(OrderExpiryService expiry) {
        this.expiry = expiry;
    }

    @Scheduled(initialDelayString = "${unimarket.orders.expiry.initial-delay}", fixedDelayString = "${unimarket.orders.expiry.interval}")
    public void run() {
        try {
            expiry.expireOverdueOrders();
        } catch (RuntimeException ex) {
            log.error("Order expiry run failed; nothing was changed. It will run again at the next interval.", ex);
        }
    }
}
