package com.unimarket.service.shipping;

import com.unimarket.security.SecretKeys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Signs and verifies simulated shipping quote tokens (HMAC-SHA256, key {@code SHIPPING_QUOTE_SECRET}).
 * A token binds ONE option to the buyer, seller, exact listing set, pickup and delivery areas, carrier, distance, fee,
 * formula version and expiry. Nothing is stored; the backend still recomputes the fee at checkout.
 * Format: {@code v1.<base64url(payload)>.<base64url(hmac)>}.
 */
@Component
@Profile("!nodb")
public class QuoteTokens {

    private static final String ALGORITHM = "HmacSHA256";
    private static final String VERSION = "v1";

    private final SecretKeySpec key;

    public QuoteTokens(@Value("${unimarket.shipping.quote.secret:}") String secret,
                       @Value("${unimarket.shipping.quote.allow-ephemeral-secret:false}") boolean allowEphemeral) {
        this.key = new SecretKeySpec(SecretKeys.load(secret, "SHIPPING_QUOTE_SECRET", allowEphemeral), ALGORITHM);
    }

    /** The signed content of a token. */
    public record Claims(int buyerId, int sellerId, List<Integer> productIds, int pickupZoneId, int deliveryZoneId,
                         String carrier, int distanceTenths, long fee, String formulaVersion, Instant expiresAt) {

        public Claims {
            productIds = productIds.stream().sorted().toList();
        }

        String payload() {
            return String.join("|", VERSION, Integer.toString(buyerId), Integer.toString(sellerId),
                    productIds.stream().map(String::valueOf).collect(Collectors.joining(",")),
                    Integer.toString(pickupZoneId), Integer.toString(deliveryZoneId), carrier, Integer.toString(distanceTenths),
                    Long.toString(fee), formulaVersion, Long.toString(expiresAt.getEpochSecond()));
        }

        static Claims parse(String payload) {
            String[] p = payload.split("\\|", -1);
            if (p.length != 11 || !VERSION.equals(p[0])) {
                throw new IllegalArgumentException("unsupported token");
            }
            List<Integer> ids = Arrays.stream(p[3].split(",")).map(Integer::valueOf).toList();
            return new Claims(Integer.parseInt(p[1]), Integer.parseInt(p[2]), ids, Integer.parseInt(p[4]), Integer.parseInt(p[5]),
                    p[6], Integer.parseInt(p[7]), Long.parseLong(p[8]), p[9], Instant.ofEpochSecond(Long.parseLong(p[10])));
        }
    }

    /** @return the signed token */
    public String sign(Claims claims) {
        byte[] payload = claims.payload().getBytes(StandardCharsets.UTF_8);
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        return VERSION + "." + b64.encodeToString(payload) + "." + b64.encodeToString(mac(payload));
    }

    /**
     * Verifies the signature (constant time) BEFORE reading any field.
     *
     * @return the claims, or empty when the token is malformed or its signature is wrong (expiry is checked by the caller)
     */
    public Optional<Claims> verify(String token) {
        if (token == null || token.length() > 1000) {
            return Optional.empty();
        }
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3 || !VERSION.equals(parts[0])) {
            return Optional.empty();
        }
        try {
            Base64.Decoder b64 = Base64.getUrlDecoder();
            byte[] payload = b64.decode(parts[1]);
            byte[] signature = b64.decode(parts[2]);
            if (!MessageDigest.isEqual(mac(payload), signature)) {
                return Optional.empty();
            }
            return Optional.of(Claims.parse(new String(payload, StandardCharsets.UTF_8)));
        } catch (IllegalArgumentException ex) {     // bad Base64 or malformed numbers (NumberFormatException included)
            return Optional.empty();
        }
    }

    private byte[] mac(byte[] payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            return mac.doFinal(payload);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA256 is not available", ex);
        }
    }
}
