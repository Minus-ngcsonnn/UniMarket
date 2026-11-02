package com.unimarket.service.order;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Mapping between the V002 SQL values and the API values (UPPER_CASE, like the frontend constants).
 *
 * <ul>
 *   <li>{@code Orders.Status}: Pending, AwaitingPayment, Paid, Delivering, Completed, Cancelled</li>
 *   <li>{@code Payments.Status}: Pending, Succeeded, Failed, Expired</li>
 *   <li>{@code Orders.PaymentProvider} / {@code Payments.Provider}: MoMo, ZaloPay (CHECK constraints)</li>
 *   <li>{@code SellerSettlements.Status}: Pending, Released; {@code OrderDisputes.Status}: Open, Resolved</li>
 * </ul>
 */
public final class OrderValues {

    public static final String PENDING = "Pending";
    public static final String AWAITING_PAYMENT = "AwaitingPayment";
    public static final String PAID = "Paid";
    public static final String DELIVERING = "Delivering";
    public static final String COMPLETED = "Completed";
    public static final String CANCELLED = "Cancelled";

    private static final Map<String, String> ORDER_STATUS = Map.of(
            PENDING, "PENDING", AWAITING_PAYMENT, "AWAITING_PAYMENT", PAID, "PAID",
            DELIVERING, "DELIVERING", COMPLETED, "COMPLETED", CANCELLED, "CANCELLED");

    private static final Map<String, String> PROVIDER_BY_API = Map.of("MOMO", "MoMo", "ZALOPAY", "ZaloPay");

    private OrderValues() {
    }

    /** {@code AwaitingPayment} → {@code AWAITING_PAYMENT} */
    public static String orderStatus(String sqlValue) {
        String api = ORDER_STATUS.get(sqlValue);
        if (api == null) {
            throw new IllegalStateException("Unknown order status in the database: " + sqlValue);
        }
        return api;
    }

    /** {@code AWAITING_PAYMENT} → {@code AwaitingPayment}; empty for unknown values */
    public static Optional<String> orderStatusSql(String apiValue) {
        return ORDER_STATUS.entrySet().stream()
                .filter(e -> e.getValue().equalsIgnoreCase(apiValue == null ? "" : apiValue.trim()))
                .map(Map.Entry::getKey).findFirst();
    }

    /** {@code Succeeded} → {@code SUCCEEDED} (also payments, settlements, disputes, decisions) */
    public static String upper(String sqlValue) {
        if (sqlValue == null) {
            return null;
        }
        return sqlValue.replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
    }

    /** {@code MOMO} → {@code MoMo}; empty when not one of the supported providers */
    public static Optional<String> providerSql(String apiValue) {
        return Optional.ofNullable(apiValue == null ? null : PROVIDER_BY_API.get(apiValue.trim().toUpperCase(Locale.ROOT)));
    }

    /** {@code MoMo} → {@code MOMO} */
    public static String provider(String sqlValue) {
        return sqlValue == null ? null : sqlValue.toUpperCase(Locale.ROOT);
    }

    /** API values accepted for the payment provider. */
    public static List<String> providers() {
        return List.of("MOMO", "ZALOPAY");
    }
}
