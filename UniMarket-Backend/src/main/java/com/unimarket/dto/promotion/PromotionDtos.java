package com.unimarket.dto.promotion;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.Instant;

/** Optional paid promotions of listings (Business Plan 4.1.2, 4.2). Standard listings stay free. */
public final class PromotionDtos {

    private PromotionDtos() {
    }

    /** A package from {@code PromotionPackages} (price and duration are set by the database, never by clients). */
    public record PromotionPackage(int id, String name, int durationHours, long price) {
    }

    /** @param packageId a {@code PromotionPackages} id; @param provider MOMO, ZALOPAY or BANK_QR */
    public record PromotionRequest(@NotNull @Positive Integer packageId, @NotBlank String provider) {
    }

    /**
     * A promotion of one listing ({@code ProductPromotions}).
     *
     * @param status       PENDING (awaiting payment), PAID, FAILED
     * @param active       true while PAID and now is within [startsAt, endsAt): the listing is "featured"
     * @param sandbox      true: simulated payment, no real money
     * @param resumed      true when a pending promotion was returned again instead of creating a new one
     * @param simulatorUrl where the sandbox simulator finishes the payment (only when the simulator is enabled)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Promotion(long id, int productId, String productTitle, PromotionPackage promotionPackage, long amount, String provider,
                            String status, boolean active, Instant startsAt, Instant endsAt, boolean sandbox, Boolean resumed,
                            String simulatorUrl) {
    }
}
