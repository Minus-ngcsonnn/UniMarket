package com.unimarket.service.shipping;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.product.ReferenceDtos;
import com.unimarket.dto.shipping.ShippingDtos;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.service.shipping.ShippingCalculator.Carrier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.TreeMap;

/**
 * Simulated shipping quotes (V003). Fees are calculated ONLY here, from database areas and the
 * {@link ShippingCalculator} formula; a client-sent amount is never used. At checkout every token is verified and the
 * fee is recomputed; any difference is refused (409 SHIPPING_QUOTE_CHANGED).
 */
@Service
@Profile("!nodb")
public class ShippingQuoteService {

    private final NamedParameterJdbcTemplate jdbc;
    private final QuoteTokens tokens;
    private final Clock clock;
    private final Duration ttl;

    public ShippingQuoteService(NamedParameterJdbcTemplate jdbc, QuoteTokens tokens, Clock clock,
                                @Value("${unimarket.shipping.quote.ttl:PT15M}") Duration ttl) {
        this.jdbc = jdbc;
        this.tokens = tokens;
        this.clock = clock;
        this.ttl = ttl;
    }

    /** A verified, recomputed shipping row for one seller order (input of {@code usp_CheckoutWithShipping}). */
    public record ConfirmedShipping(int sellerId, String carrier, int pickupZoneId, int distanceTenths, long fee,
                                    String formulaVersion) {
        public BigDecimal distanceKm() {
            return ShippingCalculator.km(distanceTenths);
        }
    }

    private record Zone(int id, String code, String name, String province, double lat, double lon, boolean active) {
        ReferenceDtos.ZoneRef ref() {
            return new ReferenceDtos.ZoneRef(id, code, name, province);
        }
    }

    private record Item(int productId, int sellerId, String sellerName, Zone zone) {
    }

    /** One seller group, computed from the database. {@code pickup} / {@code tenths} are null when unavailable. */
    private record Group(int sellerId, String sellerName, List<Integer> productIds, Zone pickup, Integer tenths, String reason) {
    }

    /**
     * @param productIds listings already checked to be purchasable by this buyer
     * @return options per seller group, each available option with a signed token
     */
    public ShippingDtos.QuoteResponse quote(int buyerId, List<Integer> productIds, int deliveryZoneId) {
        Zone delivery = deliveryZone(deliveryZoneId);
        Instant expiresAt = clock.instant().plus(ttl).truncatedTo(ChronoUnit.SECONDS);
        List<ShippingDtos.SellerQuote> quotes = new ArrayList<>();
        for (Group group : groups(productIds, delivery)) {
            List<ShippingDtos.Option> options = new ArrayList<>();
            boolean anyAvailable = false;
            for (Carrier carrier : Carrier.values()) {
                OptionalLong fee = group.tenths() == null ? OptionalLong.empty() : ShippingCalculator.fee(carrier, group.tenths());
                if (fee.isEmpty()) {
                    options.add(new ShippingDtos.Option(carrier.name(), carrier.label(), null, false, null));
                    continue;
                }
                anyAvailable = true;
                String token = tokens.sign(new QuoteTokens.Claims(buyerId, group.sellerId(), group.productIds(), group.pickup().id(),
                        delivery.id(), carrier.name(), group.tenths(), fee.getAsLong(), ShippingCalculator.FORMULA_VERSION, expiresAt));
                options.add(new ShippingDtos.Option(carrier.name(), carrier.label(), fee.getAsLong(), true, token));
            }
            String reason = group.reason() != null ? group.reason() : anyAvailable ? null : "OUT_OF_RANGE";
            quotes.add(new ShippingDtos.SellerQuote(group.sellerId(), group.sellerName(), group.productIds(),
                    group.pickup() == null ? null : group.pickup().ref(),
                    group.tenths() == null ? null : ShippingCalculator.km(group.tenths()),
                    group.tenths() != null && group.tenths() <= ShippingCalculator.FREE_TENTHS, reason == null, reason, options));
        }
        return new ShippingDtos.QuoteResponse(delivery.ref(), quotes, true, ShippingCalculator.FORMULA_VERSION,
                ShippingDtos.DISTANCE_METHOD, ShippingCalculator.FREE_TENTHS / 10, ShippingDtos.DISCLAIMER, expiresAt);
    }

    /**
     * Verifies the buyer's choice for every seller group and recomputes each fee from the database.
     *
     * @return one confirmed row per seller, ordered by seller id
     * @throws ApiException 400 INVALID_ZONE / SHIPPING_QUOTE_INVALID, 409 SHIPPING_QUOTE_CHANGED / SHIPPING_UNAVAILABLE
     */
    public List<ConfirmedShipping> verifyForCheckout(int buyerId, List<Integer> productIds, int deliveryZoneId,
                                                     List<ShippingDtos.ShippingChoice> choices) {
        Zone delivery = deliveryZone(deliveryZoneId);
        Map<Integer, ShippingDtos.ShippingChoice> bySeller = new HashMap<>();
        for (ShippingDtos.ShippingChoice choice : choices) {
            if (bySeller.put(choice.sellerId(), choice) != null) {
                throw invalid("shipping[" + choice.sellerId() + "]", "only one shipping choice per seller");
            }
        }
        List<Group> groups = groups(productIds, delivery);
        for (Integer sellerId : bySeller.keySet()) {
            if (groups.stream().noneMatch(g -> g.sellerId() == sellerId)) {
                throw invalid("shipping[" + sellerId + "]", "this seller has no listing in the checkout");
            }
        }
        Instant now = clock.instant();
        List<ConfirmedShipping> confirmed = new ArrayList<>();
        for (Group group : groups) {
            String field = "shipping[" + group.sellerId() + "]";
            ShippingDtos.ShippingChoice choice = bySeller.get(group.sellerId());
            if (choice == null) {
                throw invalid(field, "a shipping choice is required for every seller");
            }
            QuoteTokens.Claims claims = tokens.verify(choice.quoteToken()).orElseThrow(() -> invalid(field, "quote token is not valid"));
            if (claims.buyerId() != buyerId || claims.sellerId() != group.sellerId()
                    || !claims.productIds().equals(group.productIds()) || claims.deliveryZoneId() != delivery.id()
                    || !claims.carrier().equals(choice.carrier())) {
                throw invalid(field, "quote token does not match this checkout");
            }
            if (!ShippingCalculator.FORMULA_VERSION.equals(claims.formulaVersion()) || !claims.expiresAt().isAfter(now)) {
                throw changed(field, "quote expired");
            }
            if (group.reason() != null) {
                throw unavailable(field, group.reason());
            }
            Carrier carrier;
            try {
                carrier = Carrier.valueOf(claims.carrier());
            } catch (IllegalArgumentException ex) {
                throw invalid(field, "unknown carrier");
            }
            OptionalLong fee = ShippingCalculator.fee(carrier, group.tenths());
            if (fee.isEmpty()) {
                throw unavailable(field, "OUT_OF_RANGE");
            }
            if (claims.pickupZoneId() != group.pickup().id() || claims.distanceTenths() != group.tenths()
                    || claims.fee() != fee.getAsLong()) {
                throw changed(field, "the estimate is now " + fee.getAsLong() + " VND");
            }
            confirmed.add(new ConfirmedShipping(group.sellerId(), carrier.name(), group.pickup().id(), group.tenths(),
                    fee.getAsLong(), ShippingCalculator.FORMULA_VERSION));
        }
        return confirmed;
    }

    // ------------------------------------------------------------------ helpers

    private Zone deliveryZone(int zoneId) {
        return jdbc.query("SELECT ZoneId, Code, Name, Province, Latitude, Longitude, IsActive FROM dbo.LocationZones WHERE ZoneId = :id",
                        Map.of("id", zoneId), (rs, i) -> zone(rs)).stream()
                .filter(Zone::active).findFirst()
                .orElseThrow(() -> new ValidationException(ErrorCode.INVALID_ZONE, ErrorCode.INVALID_ZONE.defaultMessage(),
                        List.of(new ApiErrorResponse.FieldError("deliveryZoneId", "choose one of the available areas"))));
    }

    /** Groups the listings by seller; the pickup area of a group is its item area farthest from the destination. */
    private List<Group> groups(List<Integer> productIds, Zone delivery) {
        List<Item> items = jdbc.query("""
                SELECT p.ProductId, p.SellerId, u.FullName AS SellerName,
                       z.ZoneId, z.Code, z.Name, z.Province, z.Latitude, z.Longitude, z.IsActive
                FROM dbo.Products AS p
                JOIN dbo.Users AS u ON u.UserId = p.SellerId
                LEFT JOIN dbo.Campuses AS ca ON ca.CampusId = p.CampusId
                LEFT JOIN dbo.LocationZones AS z ON z.ZoneId = COALESCE(p.PickupZoneId, ca.ZoneId)
                WHERE p.ProductId IN (:ids)""", Map.of("ids", productIds), (rs, i) -> new Item(rs.getInt("ProductId"),
                rs.getInt("SellerId"), rs.getString("SellerName"), rs.getObject("ZoneId") == null ? null : zone(rs)));
        if (items.size() != productIds.size()) {
            throw new ApiException(ErrorCode.LISTING_UNAVAILABLE);
        }
        Map<Integer, List<Item>> bySeller = new TreeMap<>();
        items.forEach(item -> bySeller.computeIfAbsent(item.sellerId(), k -> new ArrayList<>()).add(item));
        List<Group> groups = new ArrayList<>();
        for (List<Item> sellerItems : bySeller.values()) {
            Item first = sellerItems.get(0);
            List<Integer> ids = sellerItems.stream().map(Item::productId).sorted().toList();
            if (sellerItems.stream().anyMatch(item -> item.zone() == null || !item.zone().active())) {
                groups.add(new Group(first.sellerId(), first.sellerName(), ids, null, null, "NO_PICKUP_AREA"));
                continue;
            }
            Map<Integer, Zone> zones = new LinkedHashMap<>();
            sellerItems.forEach(item -> zones.putIfAbsent(item.zone().id(), item.zone()));
            // Farthest area from the destination; on a tie the lowest zone id, so the choice is deterministic.
            Zone pickup = zones.values().stream()
                    .max(Comparator.comparingInt((Zone z) -> tenths(z, delivery)).thenComparing(Zone::id, Comparator.reverseOrder()))
                    .orElseThrow();
            groups.add(new Group(first.sellerId(), first.sellerName(), ids, pickup, tenths(pickup, delivery), null));
        }
        return groups;
    }

    private static int tenths(Zone from, Zone to) {
        return ShippingCalculator.distanceTenths(from.id() == to.id(), from.lat(), from.lon(), to.lat(), to.lon());
    }

    private static Zone zone(ResultSet rs) throws SQLException {
        return new Zone(rs.getInt("ZoneId"), rs.getString("Code"), rs.getString("Name"), rs.getString("Province"),
                rs.getBigDecimal("Latitude").doubleValue(), rs.getBigDecimal("Longitude").doubleValue(), rs.getBoolean("IsActive"));
    }

    private static ValidationException invalid(String field, String message) {
        return new ValidationException(ErrorCode.SHIPPING_QUOTE_INVALID, ErrorCode.SHIPPING_QUOTE_INVALID.defaultMessage(),
                List.of(new ApiErrorResponse.FieldError(field, message)));
    }

    private static ValidationException changed(String field, String message) {
        return new ValidationException(ErrorCode.SHIPPING_QUOTE_CHANGED, ErrorCode.SHIPPING_QUOTE_CHANGED.defaultMessage(),
                List.of(new ApiErrorResponse.FieldError(field, message)));
    }

    private static ValidationException unavailable(String field, String reason) {
        return new ValidationException(ErrorCode.SHIPPING_UNAVAILABLE, ErrorCode.SHIPPING_UNAVAILABLE.defaultMessage(),
                List.of(new ApiErrorResponse.FieldError(field, reason)));
    }
}
