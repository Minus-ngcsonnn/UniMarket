package com.unimarket.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Loads HMAC keys from configuration. Keys must be Base64 and at least 256 bits long.
 * The key value itself is never logged.
 */
public final class SecretKeys {

    /** Minimum key length for HMAC-SHA-256 (RFC 7518, section 3.2). */
    public static final int MIN_KEY_BYTES = 32;

    private static final Logger log = LoggerFactory.getLogger(SecretKeys.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private SecretKeys() {
    }

    /**
     * @param base64         configured key, Base64 encoded (may be blank)
     * @param name           property / environment variable name, for messages
     * @param allowEphemeral true only for local development and tests
     * @return the key bytes
     * @throws IllegalStateException when the key is missing (and ephemeral keys are not allowed),
     *                               not Base64, or shorter than {@value #MIN_KEY_BYTES} bytes
     */
    public static byte[] load(String base64, String name, boolean allowEphemeral) {
        if (base64 == null || base64.isBlank()) {
            if (!allowEphemeral) {
                throw new IllegalStateException(name + " is not set. Configure a Base64 key of at least "
                        + MIN_KEY_BYTES + " random bytes (see UniMarket-Backend/.env.example).");
            }
            log.warn("{} is not set: using a random key for this run only (development). "
                    + "Tokens and codes issued now stop working after a restart.", name);
            byte[] key = new byte[48];
            RANDOM.nextBytes(key);
            return key;
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException(name + " must be Base64 encoded.");
        }
        if (key.length < MIN_KEY_BYTES) {
            throw new IllegalStateException(name + " must decode to at least " + MIN_KEY_BYTES + " bytes.");
        }
        return key;
    }
}
