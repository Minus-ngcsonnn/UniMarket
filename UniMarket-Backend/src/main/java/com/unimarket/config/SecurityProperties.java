package com.unimarket.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

/**
 * Security settings ({@code unimarket.security.*}). Secrets are only read from the environment.
 *
 * @param jwt          access token settings
 * @param verification email verification code settings
 * @param login        login throttling
 * @param cors         allowed browser origins
 */
@ConfigurationProperties("unimarket.security")
public record SecurityProperties(Jwt jwt, Verification verification, Login login, Cors cors) {

    /**
     * @param secret               Base64 HMAC key (>= 32 bytes) for HS256 signatures
     * @param issuer               value of the {@code iss} claim
     * @param audience             value of the {@code aud} claim
     * @param accessTokenTtl       lifetime of an access token
     * @param allowEphemeralSecret dev/test only: use a random key when {@code secret} is empty
     */
    public record Jwt(String secret, String issuer, String audience, Duration accessTokenTtl, boolean allowEphemeralSecret) {
    }

    /**
     * @param secret               Base64 HMAC key (>= 32 bytes) used to hash codes before storing them
     * @param allowEphemeralSecret dev/test only: use a random key when {@code secret} is empty
     * @param codeTtl              how long a code stays valid
     * @param maxAttempts          wrong codes allowed before the current code is closed
     * @param resendCooldown       minimum time between two codes
     * @param maxCodesPerHour      maximum number of codes issued to one account per hour
     */
    public record Verification(String secret, boolean allowEphemeralSecret, Duration codeTtl, int maxAttempts,
                               Duration resendCooldown, int maxCodesPerHour) {
    }

    /**
     * @param maxFailures failed logins for one email before it is locked for {@code lockout}
     * @param lockout     how long sign-in is blocked after too many failures
     */
    public record Login(int maxFailures, Duration lockout) {
    }

    /** @param allowedOrigins exact browser origins allowed to call the API */
    public record Cors(List<String> allowedOrigins) {
    }
}
