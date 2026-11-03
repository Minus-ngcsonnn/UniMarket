package com.unimarket.shipping;

import com.unimarket.dto.auth.RegisterRequest;
import com.unimarket.dto.order.PaymentResponses;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.shipping.QuoteTokens;
import com.unimarket.service.shipping.ShippingCalculator;
import com.unimarket.service.shipping.ShippingCalculator.Carrier;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.OptionalLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V003 pure rules: shipping formula SIM-2026-11, quote tokens, registration affiliation, provider mapping, demo QR. */
class ShippingRulesTest {

    private static final String KEY = Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef-test-key".getBytes(StandardCharsets.UTF_8));

    // ------------------------------------------------------------------ formula (expected values from the design table)

    @ParameterizedTest(name = "{0} tenths -> grab {1}, ahamove {2}, standard {3}")
    @CsvSource({
            "0, 0, 0, 0",
            "29, 0, 0, 0",
            "30, 0, 0, 0",                 // exactly 3.0 km: still free
            "31, 16000, 14000, 11000",     // 3.1 km: first paid distance
            "52, 26000, 23000, 16000",
            "400, 200000, 180000, 103000", // 40.0 km: last distance for the express carriers
            "401, -1, -1, 103000",
            "1000, -1, -1, 253000",        // 100.0 km: last distance for standard
            "1001, -1, -1, -1"})
    void feeBoundaries(int tenths, long grab, long ahamove, long standard) {
        assertThat(fee(Carrier.GRAB_EXPRESS_SIM, tenths)).isEqualTo(grab);
        assertThat(fee(Carrier.AHAMOVE_SIM, tenths)).isEqualTo(ahamove);
        assertThat(fee(Carrier.STANDARD_SIM, tenths)).isEqualTo(standard);
    }

    @Test
    void feesAreWholeThousandsAndBounded() {
        for (Carrier carrier : Carrier.values()) {
            for (int t = 0; t <= carrier.maxTenths(); t++) {
                long fee = ShippingCalculator.fee(carrier, t).orElseThrow();
                assertThat(fee % 1000).isZero();
                assertThat(fee).isBetween(0L, 253_000L);
                if (t > 0) {
                    assertThat(fee).as("never cheaper for a longer distance").isGreaterThanOrEqualTo(ShippingCalculator.fee(carrier, t - 1).orElseThrow());
                }
            }
        }
        assertThatThrownBy(() -> ShippingCalculator.fee(Carrier.STANDARD_SIM, -1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void distanceIsZeroInTheSameAreaAndSymmetricOtherwise() {
        assertThat(ShippingCalculator.distanceTenths(true, 21.0, 105.5, 10.0, 106.0)).isZero();
        int ab = ShippingCalculator.distanceTenths(false, 21.013528, 105.525261, 21.028670, 105.786604);
        int ba = ShippingCalculator.distanceTenths(false, 21.028670, 105.786604, 21.013528, 105.525261);
        assertThat(ab).isEqualTo(ba);
        // Hòa Lạc -> Cầu Giấy (OSM points): about 27.2 km straight line, × 1.3, rounded up to 0.1 km.
        assertThat(ab).isBetween(350, 360);
        assertThatThrownBy(() -> ShippingCalculator.distanceTenths(false, Double.NaN, 105, 21, 105)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void distanceIsRoundedUpToATenth() {
        // ~0.1 degree of latitude ≈ 11.1 km; × 1.3 ≈ 14.45 km -> 14.5 km (rounded up, never down).
        int t = ShippingCalculator.distanceTenths(false, 10.0, 106.0, 10.1, 106.0);
        assertThat(t).isEqualTo(145);
        assertThat(ShippingCalculator.km(t)).isEqualByComparingTo("14.5");
    }

    private static long fee(Carrier carrier, int tenths) {
        OptionalLong fee = ShippingCalculator.fee(carrier, tenths);
        return fee.isPresent() ? fee.getAsLong() : -1;
    }

    // ------------------------------------------------------------------ quote tokens

    private static QuoteTokens.Claims claims(Instant expiresAt) {
        return new QuoteTokens.Claims(7, 9, List.of(30, 10, 20), 1, 2, "STANDARD_SIM", 359, 93_000, "SIM-2026-11", expiresAt);
    }

    @Test
    void tokensRoundTripAndBindEveryField() {
        QuoteTokens tokens = new QuoteTokens(KEY, false);
        Instant expires = Instant.ofEpochSecond(2_000_000_000L);
        String token = tokens.sign(claims(expires));
        QuoteTokens.Claims back = tokens.verify(token).orElseThrow();
        assertThat(back).isEqualTo(claims(expires));
        assertThat(back.productIds()).containsExactly(10, 20, 30);
        assertThat(token).doesNotContain("=").startsWith("v1.");
    }

    @Test
    void tamperedForeignOrMalformedTokensAreRejected() {
        QuoteTokens tokens = new QuoteTokens(KEY, false);
        String token = tokens.sign(claims(Instant.ofEpochSecond(2_000_000_000L)));
        String[] parts = token.split("\\.");
        String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        String cheaper = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.replace("|93000|", "|0|").getBytes(StandardCharsets.UTF_8));
        assertThat(tokens.verify(parts[0] + "." + cheaper + "." + parts[2])).isEmpty();
        assertThat(tokens.verify(parts[0] + "." + parts[1] + "." + parts[2].substring(1) + (parts[2].charAt(0) == 'A' ? "B" : "A"))).isEmpty();
        String otherKey = Base64.getEncoder().encodeToString("another-key-another-key-another-key!!".getBytes(StandardCharsets.UTF_8));
        assertThat(new QuoteTokens(otherKey, false).verify(token)).as("signed with another secret").isEmpty();
        for (String bad : new String[]{null, "", "v1", "v1..", "v2." + parts[1] + "." + parts[2], "v1.%%%.###", "x".repeat(2000)}) {
            assertThat(tokens.verify(bad)).as(String.valueOf(bad)).isEmpty();
        }
    }

    @Test
    void aMissingSecretIsRefusedOutsideDevelopment() {
        assertThatThrownBy(() -> new QuoteTokens("", false)).isInstanceOf(IllegalStateException.class).hasMessageContaining("SHIPPING_QUOTE_SECRET");
        assertThatThrownBy(() -> new QuoteTokens(Base64.getEncoder().encodeToString(new byte[8]), false)).isInstanceOf(IllegalStateException.class);
    }

    // ------------------------------------------------------------------ registration affiliation

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static List<String> violations(Integer campusId, String universityName) {
        return VALIDATOR.validate(new RegisterRequest("Student Name", "s@gmail.com", "Secret123", campusId, universityName, null)).stream()
                .map(v -> v.getPropertyPath().toString()).sorted().toList();
    }

    @Test
    void exactlyOneAffiliation() {
        assertThat(violations(1, null)).isEmpty();
        assertThat(violations(null, "Đại học Cần Thơ")).isEmpty();
        assertThat(violations(null, null)).containsExactly("affiliationProvided");
        assertThat(violations(null, "   ")).containsExactly("affiliationProvided");
        assertThat(violations(1, "Đại học Cần Thơ")).containsExactly("affiliationProvided");
        assertThat(violations(null, " A ")).containsExactly("universityNameLongEnough");
        assertThat(violations(null, "x".repeat(201))).contains("universityName");
        assertThat(new RegisterRequest("n", "e", "p", null, "  Đại   học\tCần Thơ ", null).normalizedUniversityName()).isEqualTo("Đại học Cần Thơ");
    }

    // ------------------------------------------------------------------ simulated Bank QR

    @Test
    void bankQrIsMappedAndItsDemoPayloadIsNotABankQr() {
        assertThat(OrderValues.providerSql("BANK_QR")).contains("BankQR");
        assertThat(OrderValues.providerSql("bank_qr")).contains("BankQR");
        assertThat(OrderValues.provider("BankQR")).isEqualTo("BANK_QR");
        assertThat(OrderValues.provider("MoMo")).isEqualTo("MOMO");
        assertThat(OrderValues.provider("ZaloPay")).isEqualTo("ZALOPAY");
        assertThat(OrderValues.providerSql("BANKQR")).isEmpty();
        assertThat(OrderValues.providers()).containsExactly("MOMO", "ZALOPAY", "BANK_QR");
        PaymentResponses.BankQrDemo qr = PaymentResponses.BankQrDemo.of(12, 34, 150_000);
        assertThat(qr.qrPayload()).isEqualTo("UNIMARKET-SIMULATED-PAYMENT|ref=UMDEMO-12-34|amount=150000|NOT-A-BANK-QR");
        assertThat(qr.qrPayload()).as("not an EMVCo / VietQR payload").doesNotStartWith("00");
        assertThat(qr.simulated()).isTrue();
        assertThat(qr.notice()).contains("SIMULATED").contains("do not transfer money");
    }
}
