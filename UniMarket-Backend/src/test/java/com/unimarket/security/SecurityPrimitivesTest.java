package com.unimarket.security;

import com.unimarket.config.SecurityProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests of the verification-code hasher, the attempt limiter and key loading.
 */
class SecurityPrimitivesTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

    private static VerificationCodeHasher hasher(String key) {
        return new VerificationCodeHasher(new SecurityProperties(null,
                new SecurityProperties.Verification(key, false, Duration.ofMinutes(10), 5, Duration.ofSeconds(60), 5), null, null));
    }

    @Test
    void codesAreSixRandomDigits() {
        VerificationCodeHasher hasher = hasher(KEY);
        Set<String> codes = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            String code = hasher.newCode();
            assertThat(code).matches("\\d{6}");
            codes.add(code);
        }
        assertThat(codes).hasSizeGreaterThan(190);   // random, not sequential or constant
    }

    @Test
    void digestIsKeyedAndBoundToTheUser() {
        VerificationCodeHasher hasher = hasher(KEY);
        byte[] a = hasher.hash(1, "123456");
        assertThat(a).hasSize(32).isEqualTo(hasher.hash(1, "123456"));
        // Same code for another user -> different digest (UNIQUE TokenHash never clashes across users).
        assertThat(hasher.hash(2, "123456")).isNotEqualTo(a);
        // Not a plain SHA-256: another server key gives another digest.
        String otherKey = Base64.getEncoder().encodeToString("x".repeat(32).getBytes());
        assertThat(hasher(otherKey).hash(1, "123456")).isNotEqualTo(a);
    }

    @Test
    void limiterBlocksAfterMaxFailuresAndForgetsAfterTheWindow() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-02T00:00:00Z"));
        Clock clock = new Clock() {
            @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        AttemptLimiter limiter = new AttemptLimiter(3, Duration.ofMinutes(15), clock);
        assertThat(limiter.recordFailure("k")).isEqualTo(1);
        assertThat(limiter.recordFailure("k")).isEqualTo(2);
        assertThat(limiter.isBlocked("k")).isFalse();
        assertThat(limiter.recordFailure("k")).isEqualTo(3);
        assertThat(limiter.isBlocked("k")).isTrue();
        assertThat(limiter.isBlocked("other")).isFalse();
        now.set(now.get().plus(Duration.ofMinutes(16)));
        assertThat(limiter.isBlocked("k")).isFalse();
        limiter.recordFailure("k");
        limiter.reset("k");
        assertThat(limiter.isBlocked("k")).isFalse();
    }

    @Test
    void secretKeysRejectBadValues() {
        assertThatThrownBy(() -> SecretKeys.load("not base64 !!", "X", false)).hasMessageContaining("Base64");
        assertThatThrownBy(() -> SecretKeys.load(Base64.getEncoder().encodeToString(new byte[31]), "X", false)).hasMessageContaining("32 bytes");
        assertThatThrownBy(() -> SecretKeys.load(" ", "X", false)).hasMessageContaining("X is not set");
        assertThat(SecretKeys.load(null, "X", true)).hasSizeGreaterThanOrEqualTo(32);   // dev fallback
        assertThat(SecretKeys.load(KEY, "X", false)).hasSize(32);
    }
}
