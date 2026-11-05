package com.unimarket.dto.order;

import com.unimarket.dto.shipping.ShippingDtos.ShippingChoice;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/** Request bodies of the cart, checkout and order endpoints. */
public final class OrderRequests {

    /** Vietnamese mobile number, the same rule as the frontend ({@code isVietnamesePhone}); spaces, dots, dashes allowed. */
    public static final String PHONE_PATTERN = "^\\s*(0|\\+84)[\\s.-]*[35789]([\\s.-]*\\d){8}\\s*$";

    private OrderRequests() {
    }

    /**
     * Checkout of selected cart listings. Prices, sellers and availability are always read from the database.
     *
     * @param productIds      selected listings (1–50, no duplicates)
     * @param recipientName   who receives the items
     * @param recipientPhone  Vietnamese mobile number
     * @param deliveryAddress where the seller delivers (e.g. dormitory and room)
     * @param paymentProvider optional now (MOMO, ZALOPAY or BANK_QR - all simulated); can also be chosen when paying
     * @param expectedPrices  optional: the prices the buyer saw, by listing id; any difference → 409 PRICE_CHANGED
     * @param deliveryZoneId  V003: the delivery area used for the shipping quotes
     * @param shipping        V003: one choice per seller (carrier + quote token from {@code POST /api/shipping/quotes});
     *                        no amount is accepted from the client
     */
    public record CheckoutRequest(
            @NotEmpty @Size(max = 50) List<@NotNull @Positive Integer> productIds,
            @NotBlank @Size(min = 2, max = 150) String recipientName,
            @NotBlank @Pattern(regexp = PHONE_PATTERN, message = "must be a Vietnamese mobile number") String recipientPhone,
            @NotBlank @Size(min = 5, max = 500) String deliveryAddress,
            String paymentProvider,
            Map<Integer, Long> expectedPrices,
            @NotNull @Positive Integer deliveryZoneId,
            @NotEmpty @Size(max = 50) List<@Valid @NotNull ShippingChoice> shipping,
            @NotNull @jakarta.validation.constraints.DecimalMin("-90") @jakarta.validation.constraints.DecimalMax("90")
            @jakarta.validation.constraints.Digits(integer = 3, fraction = 6) java.math.BigDecimal deliveryLatitude,
            @NotNull @jakarta.validation.constraints.DecimalMin("-180") @jakarta.validation.constraints.DecimalMax("180")
            @jakarta.validation.constraints.Digits(integer = 3, fraction = 6) java.math.BigDecimal deliveryLongitude) {
    }

    /**
     * Checks selected listings before checkout without placing an order.
     *
     * @param productIds     listings to check (default: the whole cart)
     * @param expectedPrices optional prices the buyer saw
     */
    public record CartValidationRequest(@Size(max = 50) List<@NotNull @Positive Integer> productIds, Map<Integer, Long> expectedPrices) {
    }

    /** @param reason optional reason shown to the other party (max 500) */
    public record CancelRequest(@Size(max = 500) String reason) {
    }

    /** Seller-arranged delivery: courier and tracking number are optional (V002 usp_ShipOrder). */
    public record ShipRequest(@Size(max = 100) String carrier, @Size(max = 100) String trackingNumber) {
    }

    /** @param provider MOMO, ZALOPAY or BANK_QR (simulated); may be omitted when it was chosen at checkout */
    public record StartPaymentRequest(String provider) {
    }

    /** @param reason what went wrong (required, max 2000) */
    public record DisputeRequest(@NotBlank @Size(max = 2000) String reason) {
    }
}
