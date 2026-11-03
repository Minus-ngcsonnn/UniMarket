package com.unimarket.service.shipping;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.OptionalLong;

/**
 * Simulated shipping formula {@value #FORMULA_VERSION} (V003 design, section 4). Pure and deterministic.
 *
 * <ol>
 *   <li>Distance in tenths of a km: 0 for the same zone, else {@code ceil(round6(haversine × 1.3) × 10)}.
 *       Centre-to-centre straight line × 1.3: an APPROXIMATION, not a road distance or route.</li>
 *   <li>{@code ≤ 3.0 km} (30 tenths): free for every carrier.</li>
 *   <li>Beyond the carrier maximum: that carrier is unavailable.</li>
 *   <li>Otherwise {@code ceil((base + perKm × (t − 30) / 10) / 1000) × 1000} VND, integer arithmetic only.</li>
 * </ol>
 * No real provider API, account, contract or published tariff is used; the carriers are labelled "(simulated)".
 */
public final class ShippingCalculator {

    public static final String FORMULA_VERSION = "SIM-2026-11";
    /** Free radius in tenths of a km (3.0 km, inclusive). */
    public static final int FREE_TENTHS = 30;
    public static final double ROAD_FACTOR = 1.3;
    private static final double EARTH_RADIUS_KM = 6371.0088;

    /** Simulated carriers; constants are the approved demo values, not real tariffs. */
    public enum Carrier {
        GRAB_EXPRESS_SIM("GrabExpress (simulated)", 15_000, 5_000, 400),
        AHAMOVE_SIM("Ahamove (simulated)", 13_000, 4_500, 400),
        STANDARD_SIM("Standard delivery (simulated)", 10_000, 2_500, 1_000);

        private final String label;
        private final long base;
        private final long perKm;
        private final int maxTenths;

        Carrier(String label, long base, long perKm, int maxTenths) {
            this.label = label;
            this.base = base;
            this.perKm = perKm;
            this.maxTenths = maxTenths;
        }

        public String label() { return label; }
        public int maxTenths() { return maxTenths; }
    }

    private ShippingCalculator() {
    }

    /**
     * @param sameZone true when pickup and delivery are the same zone (distance 0)
     * @return the approximate distance in tenths of a km (≥ 0)
     */
    public static int distanceTenths(boolean sameZone, double lat1, double lon1, double lat2, double lon2) {
        if (sameZone) {
            return 0;
        }
        for (double v : new double[]{lat1, lon1, lat2, lon2}) {
            if (!Double.isFinite(v)) {
                throw new IllegalArgumentException("coordinates must be finite");
            }
        }
        double road = haversineKm(lat1, lon1, lat2, lon2) * ROAD_FACTOR;
        // Round to 6 decimals first so float noise (3.0000000001) does not push a boundary distance up a tenth.
        BigDecimal rounded = BigDecimal.valueOf(road).setScale(6, RoundingMode.HALF_UP);
        return rounded.movePointRight(1).setScale(0, RoundingMode.CEILING).intValueExact();
    }

    /**
     * @param tenths distance in tenths of a km (≥ 0)
     * @return the fee in whole VND, or empty when the carrier does not serve this distance
     */
    public static OptionalLong fee(Carrier carrier, int tenths) {
        if (tenths < 0) {
            throw new IllegalArgumentException("distance must not be negative");
        }
        if (tenths <= FREE_TENTHS) {
            return OptionalLong.of(0);
        }
        if (tenths > carrier.maxTenths) {
            return OptionalLong.empty();
        }
        // perKm × (t − 30) is divisible by 10 because every perKm is a multiple of 10 VND.
        long raw = carrier.base + carrier.perKm * (tenths - FREE_TENTHS) / 10;
        return OptionalLong.of((raw + 999) / 1000 * 1000);
    }

    /** @return the distance in km with one decimal, for display and storage ({@code decimal(6,1)}) */
    public static BigDecimal km(int tenths) {
        return BigDecimal.valueOf(tenths, 1);
    }

    static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLon / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
    }
}
