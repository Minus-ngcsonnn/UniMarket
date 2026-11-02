package com.unimarket.service.order;

import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.PaymentResponses;
import com.unimarket.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Records a payment provider result that has ALREADY BEEN AUTHENTICATED by the caller (signature checked).
 * This is the only code that can make an order Paid, through {@code usp_RecordPaymentResult}, which checks:
 * the attempt exists (request key) and belongs to the order, provider and amount match the order total,
 * duplicates (identical → ignored, conflicting → rejected), and the payment deadline with the approved
 * 30-minute grace window for attempts started before the deadline.
 */
@Service
@Profile("!nodb")
public class PaymentResultService {

    private static final Logger log = LoggerFactory.getLogger(PaymentResultService.class);

    private final OrderQueries queries;
    private final OrderProcedures procedures;

    public PaymentResultService(OrderQueries queries, OrderProcedures procedures) {
        this.queries = queries;
        this.procedures = procedures;
    }

    /**
     * @param notification authenticated provider result
     * @param sandboxOnly  true for the simulator: it may only settle sandbox (simulated) attempts
     */
    public PaymentResponses.CallbackResult record(PaymentNotification notification, boolean sandboxOnly) {
        OrderQueries.PaymentRow before = queries.paymentByRequestKey(notification.requestKey())
                .orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_MISMATCH, "Unknown payment request."));
        if (sandboxOnly && !before.sandbox()) {
            log.warn("Simulated notification refused for real payment attempt {}", before.id());
            throw new ApiException(ErrorCode.PAYMENT_MISMATCH, "Unknown payment request.");
        }
        String provider = OrderValues.providerSql(notification.provider())
                .orElseThrow(() -> new ApiException(ErrorCode.PAYMENT_MISMATCH, "Unknown payment provider."));
        if (notification.providerReference() == null || notification.providerReference().isBlank() || notification.providerReference().length() > 150) {
            throw new ApiException(ErrorCode.PAYMENT_MISMATCH, "A provider reference is required.");
        }
        try {
            procedures.recordPaymentResult(notification.requestKey(), notification.providerReference(),
                    BigDecimal.valueOf(notification.amount()), notification.success(), provider);
        } catch (DataAccessException ex) {
            int number = SqlErrors.numberOf(ex);
            if ((number == 51025 || number == 51026) && notification.success()) {
                // V002 open point: no database record exists for a rejected late success; the log line is the alert.
                log.error("PAYMENT ALERT: late successful payment for attempt {} of order {} was rejected ({}). "
                        + "If the buyer was charged, an admin must refund manually (D3).", before.id(), before.orderId(), number);
            }
            if (SqlErrors.isDuplicateKey(ex)) {
                throw new ApiException(ErrorCode.PAYMENT_CONFLICT);
            }
            throw switch (number) {
                case 51009, 51010 -> new ApiException(ErrorCode.PAYMENT_MISMATCH);
                case 51011 -> new ApiException(ErrorCode.PAYMENT_CONFLICT);
                case 51012 -> new ApiException(ErrorCode.ORDER_STATE_CONFLICT, "The order is not awaiting payment.");
                case 51025, 51026 -> new ApiException(ErrorCode.PAYMENT_TOO_LATE);
                default -> ex;
            };
        }
        OrderQueries.PaymentRow after = queries.paymentByRequestKey(notification.requestKey()).orElseThrow();
        String orderStatus = queries.order(after.orderId()).map(OrderQueries.OrderRow::status).orElseThrow();
        boolean duplicate = !"Pending".equals(before.status());
        log.info("Payment attempt {} of order {}: {} ({})", after.id(), after.orderId(), after.status(), duplicate ? "duplicate ignored" : "recorded");
        return new PaymentResponses.CallbackResult(duplicate ? "DUPLICATE_IGNORED" : "RECORDED", OrderValues.upper(after.status()),
                OrderValues.orderStatus(orderStatus));
    }

    /**
     * A provider's payment result after its authenticity was verified.
     *
     * @param requestKey        our {@code Payments.RequestKey} (the provider's order reference)
     * @param providerReference the provider's transaction id
     * @param amount            amount the provider charged (VND)
     * @param success           true when paid
     * @param provider          MOMO or ZALOPAY
     */
    public record PaymentNotification(String requestKey, String providerReference, long amount, boolean success, String provider) {

        /** Canonical text that is signed: fields joined with a line feed, in this order. */
        public String canonical() {
            return String.join("\n", requestKey, providerReference, Long.toString(amount), success ? "1" : "0", provider);
        }
    }
}
