package com.unimarket.dto.shipping;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.unimarket.dto.product.ReferenceDtos;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/** Simulated shipping (V003): quote request / response and the per-seller choice sent with checkout. */
public final class ShippingDtos {

    /** Shown with every estimate (API and UI). */
    public static final String DISCLAIMER = "Simulated estimate for the UniMarket academic demo - not a quotation from or "
            + "partnership with GrabExpress or Ahamove. Distances are approximate area-to-area estimates, not routes.";
    public static final String DISTANCE_METHOD = "ZONE_CENTRE_APPROXIMATION";

    private ShippingDtos() {
    }

    /**
     * {@code POST /api/shipping/quotes}.
     *
     * @param productIds     the listings that will be checked out (1-50, no duplicates)
     * @param deliveryZoneId the buyer's delivery area ({@code GET /api/locations/zones})
     */
    public record QuoteRequest(@NotEmpty @Size(max = 50) List<@NotNull @Positive Integer> productIds,
                               @NotNull @Positive Integer deliveryZoneId) {
    }

    /**
     * One seller's choice at checkout. Only the token decides the amount; the client never sends a fee.
     *
     * @param sellerId   seller of the group
     * @param carrier    chosen carrier code, e.g. {@code STANDARD_SIM}
     * @param quoteToken token of that option from the quote response (15 minutes)
     */
    public record ShippingChoice(@NotNull @Positive Integer sellerId, @NotBlank @Size(max = 30) String carrier,
                                 @NotBlank @Size(max = 1000) String quoteToken) {
    }

    /**
     * @param deliveryZone   destination area
     * @param groups         one per seller (one order per seller)
     * @param simulated      always true
     * @param formulaVersion e.g. {@code SIM-2026-11}
     * @param distanceMethod {@value #DISTANCE_METHOD}
     * @param freeRadiusKm   3
     * @param disclaimer     text to show next to the estimate
     * @param expiresAt      when the tokens stop being accepted
     */
    public record QuoteResponse(ReferenceDtos.ZoneRef deliveryZone, List<SellerQuote> groups, boolean simulated,
                                String formulaVersion, String distanceMethod, int freeRadiusKm, String disclaimer,
                                Instant expiresAt) {
    }

    /**
     * @param sellerId    seller
     * @param sellerName  public name
     * @param productIds  the seller's listings in this checkout
     * @param pickupZone  the pickup area used (farthest item area from the destination), or null when unknown
     * @param distanceKm  approximate distance (0 in the same area), or null when unavailable
     * @param free        true within the free radius (3 km)
     * @param available   false when no option can deliver (see {@code reason})
     * @param reason      {@code NO_PICKUP_AREA} or {@code OUT_OF_RANGE} when unavailable
     * @param options     carriers with fee or availability
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SellerQuote(int sellerId, String sellerName, List<Integer> productIds, ReferenceDtos.ZoneRef pickupZone,
                              java.math.BigDecimal distanceKm, boolean free, boolean available, String reason,
                              List<Option> options) {
    }

    /**
     * @param carrier    code to send back
     * @param label      display name, always "(simulated)"
     * @param fee        whole VND (0 when free), null when unavailable
     * @param available  false beyond the carrier's maximum distance
     * @param quoteToken signed token binding this exact option to the buyer and listings; null when unavailable
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Option(String carrier, String label, Long fee, boolean available, String quoteToken) {
    }

    /**
     * Shipping block of an order (from {@code OrderShippingQuotes}).
     *
     * @param source         {@code SIMULATED_QUOTE}, or {@code LEGACY} for orders created before V003 (no quote stored)
     * @param carrier        carrier code, null for legacy
     * @param label          display name, null for legacy
     * @param distanceKm     approximate distance, null for legacy
     * @param fee            the order's shipping fee (= Orders.ShippingFee)
     * @param pickupZone     pickup area, null for legacy
     * @param deliveryZone   delivery area, null for legacy
     * @param simulated      true for simulated quotes
     * @param formulaVersion formula used, null for legacy
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OrderShipping(String source, String carrier, String label, java.math.BigDecimal distanceKm, long fee,
                                ReferenceDtos.ZoneRef pickupZone, ReferenceDtos.ZoneRef deliveryZone, Boolean simulated,
                                String formulaVersion) {
    }
}
