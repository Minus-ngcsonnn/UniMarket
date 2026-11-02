package com.unimarket.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Counts failures per key (e.g. an email address or a user id) inside a time window.
 *
 * <p>Kept in memory: counts are lost on restart and are not shared between several API
 * instances. That is acceptable for the single-instance MVP because the durable protections are
 * in the database (a verification code is closed after too many wrong attempts, and the number of
 * codes per hour is counted from {@code EmailVerificationTokens}).</p>
 */
public class AttemptLimiter {

    private final int maxFailures;
    private final Duration window;
    private final Clock clock;
    private final ConcurrentMap<String, Counter> counters = new ConcurrentHashMap<>();

    /**
     * @param maxFailures failures allowed inside the window
     * @param window      how long failures are remembered (and how long the lock lasts)
     * @param clock       time source
     */
    public AttemptLimiter(int maxFailures, Duration window, Clock clock) {
        this.maxFailures = maxFailures;
        this.window = window;
        this.clock = clock;
    }

    /** @return true while the key has reached the failure limit inside the window */
    public boolean isBlocked(String key) {
        Counter counter = counters.get(key);
        if (counter == null) {
            return false;
        }
        if (counter.expired(clock.instant())) {
            counters.remove(key, counter);
            return false;
        }
        return counter.failures >= maxFailures;
    }

    /**
     * Records one failure.
     *
     * @return the number of failures for this key inside the current window
     */
    public int recordFailure(String key) {
        Instant now = clock.instant();
        return counters.compute(key, (k, existing) -> existing == null || existing.expired(now)
                ? new Counter(1, now.plus(window))
                : new Counter(existing.failures + 1, existing.resetAt)).failures;
    }

    /** Forgets all failures of a key (after a success or a new code). */
    public void reset(String key) {
        counters.remove(key);
    }

    /** @return the configured failure limit */
    public int maxFailures() {
        return maxFailures;
    }

    private record Counter(int failures, Instant resetAt) {
        boolean expired(Instant now) {
            return !now.isBefore(resetAt);
        }
    }
}
