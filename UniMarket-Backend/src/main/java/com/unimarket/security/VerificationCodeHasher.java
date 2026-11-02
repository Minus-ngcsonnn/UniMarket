package com.unimarket.security;

import com.unimarket.config.SecurityProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;

/**
 * Generates 6-digit verification codes and hashes them for storage.
 *
 * <p>The stored value ({@code EmailVerificationTokens.TokenHash}, binary(32)) is
 * {@code HMAC-SHA-256(serverKey, "email-verification:" + userId + ":" + code)}:</p>
 * <ul>
 *   <li>the server key makes a leaked table useless for guessing codes offline (a plain SHA-256 of a
 *       6-digit code can be reversed in milliseconds);</li>
 *   <li>the user id makes equal codes of different users produce different digests, so the table's
 *       UNIQUE constraint on {@code TokenHash} is not hit when two users get the same code.</li>
 * </ul>
 */
@Component
public class VerificationCodeHasher {

    /** Number of digits in a code (the frontend expects 6). */
    public static final int CODE_LENGTH = 6;

    private static final String HMAC = "HmacSHA256";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    /** @param properties security settings (verification secret) */
    public VerificationCodeHasher(SecurityProperties properties) {
        SecurityProperties.Verification settings = properties.verification();
        this.key = new SecretKeySpec(SecretKeys.load(settings.secret(), "VERIFICATION_CODE_SECRET", settings.allowEphemeralSecret()), HMAC);
    }

    /** @return a new random code, e.g. {@code "048213"} (cryptographically secure) */
    public String newCode() {
        return String.format("%0" + CODE_LENGTH + "d", RANDOM.nextInt(1_000_000));
    }

    /**
     * @param userId owner of the code
     * @param code   the code as typed by the user
     * @return 32-byte digest to store or look up
     */
    public byte[] hash(int userId, String code) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(key);
            return mac.doFinal(("email-verification:" + userId + ":" + code).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA-256 is not available", ex);
        }
    }
}
