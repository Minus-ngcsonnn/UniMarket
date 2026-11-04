package com.unimarket.service.order;

/**
 * How a seller settlement was calculated. Derived on read, nothing is stored and no row is changed.
 *
 * <ul>
 *   <li>{@link #STANDARD}: current rule D1/D4 (V002+): merchandise subtotal − 3 % commission + the order's whole
 *       delivery fee ({@code = Orders.SellerPayoutTotal}). {@code trg_SellerSettlements_Guard} only accepts new
 *       settlements whose {@code ShippingFee} equals the order's.</li>
 *   <li>{@link #LEGACY_V001}: the demo settlements created by V001, which paid out merchandise proceeds only. V002
 *       (step 5b, approved decision) kept their original amounts and recorded {@code ShippingFee = 0}; the guard trigger
 *       forbids changing them. Their {@code Amount} is therefore lower than the order's {@code SellerPayoutTotal} by the
 *       delivery fee, by design. Released ones may also have no payout reference or admin (V001 had neither).</li>
 * </ul>
 */
public final class SettlementCalculation {

    public static final String STANDARD = "STANDARD";
    public static final String LEGACY_V001 = "LEGACY_V001_MERCHANDISE_ONLY";

    /**
     * SQL expression (1 = legacy) for a query that joins {@code dbo.SellerSettlements} as {@code s} and
     * {@code dbo.Orders} as {@code o}. Only V001 rows can differ: every later settlement is created with the order's fee.
     */
    public static final String LEGACY_SQL = "CAST(CASE WHEN s.ShippingFee <> o.ShippingFee THEN 1 ELSE 0 END AS bit)";

    private SettlementCalculation() {
    }

    public static String of(boolean legacy) {
        return legacy ? LEGACY_V001 : STANDARD;
    }
}
