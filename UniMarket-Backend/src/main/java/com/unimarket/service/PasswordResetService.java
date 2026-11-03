package com.unimarket.service;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.config.SecurityProperties;
import com.unimarket.entity.PasswordResetToken;
import com.unimarket.entity.User;
import com.unimarket.entity.UserStatus;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.repository.PasswordResetTokenRepository;
import com.unimarket.repository.UserRepository;
import com.unimarket.security.AttemptLimiter;
import com.unimarket.security.VerificationCodeHasher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/**
 * "Forgot password" with one-time 6-digit codes e-mailed through the normal sender ({@code dbo.PasswordResetTokens},
 * V001 baseline table — no migration).
 *
 * <ul>
 *   <li>Same rules as email verification ({@code unimarket.security.verification.*}): random codes valid 10 minutes,
 *       stored only as an HMAC digest (separate purpose prefix, so verification codes cannot be used here), single-use
 *       (consumed atomically together with the password change), a new code closes older ones, one code per 60 s and
 *       5 per hour per account, 5 wrong codes close the current code.</li>
 *   <li>{@code requestReset} answers the same way for unknown, disabled and active accounts, so emails cannot be
 *       probed. The only exception is the provider failing for a real account (503 EMAIL_DELIVERY_FAILED, never
 *       reported as sent) — the same narrow, accepted disclosure as the verification resend.</li>
 *   <li>A successful reset sets the new BCrypt password, marks a still-unverified address as verified (the code was
 *       e-mailed to it) and clears the failed-login lockout. It does not sign the user in.</li>
 *   <li>Access tokens issued before the reset stop working: they carry a fingerprint of the old password hash
 *       ({@link com.unimarket.security.PasswordStamp}), checked on every request. A failed reset changes nothing.</li>
 * </ul>
 */
@Service
@Profile("!nodb")
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final VerificationCodeHasher hasher;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transaction;
    private final VerificationMailer mailer;
    private final AuthService authService;
    private final SecurityProperties.Verification settings;
    private final Clock clock;
    private final AttemptLimiter wrongCodes;

    public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens, VerificationCodeHasher hasher,
                                PasswordEncoder passwordEncoder, PlatformTransactionManager transactionManager,
                                VerificationMailer mailer, AuthService authService, SecurityProperties properties, Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.hasher = hasher;
        this.passwordEncoder = passwordEncoder;
        this.transaction = new TransactionTemplate(transactionManager);
        this.mailer = mailer;
        this.authService = authService;
        this.settings = properties.verification();
        this.clock = clock;
        this.wrongCodes = new AttemptLimiter(settings.maxAttempts(), settings.codeTtl(), clock);
    }

    /**
     * E-mails a reset code when the email belongs to an active account and the limits allow it; otherwise does nothing.
     * The code is committed first, then e-mailed outside the transaction.
     *
     * @param email account email (any case)
     * @return true when a code was issued and accepted by the e-mail provider (for logging/tests only)
     * @throws ApiException EMAIL_DELIVERY_FAILED (503) when the provider refused it; the undelivered code is closed
     */
    public boolean requestReset(String email) {
        Optional<VerificationMailer.IssuedCode> issued = transaction.execute(status -> issueIfAllowed(email));
        if (issued == null || issued.isEmpty()) {
            return false;
        }
        if (mailer.deliverPasswordReset(issued.get()) == VerificationMailer.Delivery.FAILED) {
            int userId = issued.get().userId();
            transaction.executeWithoutResult(status -> tokens.closeOpenCodes(userId, nowUtc()));
            throw new ApiException(ErrorCode.EMAIL_DELIVERY_FAILED);
        }
        return true;
    }

    /**
     * Sets a new password with the e-mailed code.
     *
     * @param email       account email (any case)
     * @param code        6-digit code
     * @param newPassword validated new password
     * @throws ApiException INVALID_RESET_CODE (wrong, used or expired code, or unknown / disabled account — same answer),
     *                      TOO_MANY_ATTEMPTS (code closed after too many wrong codes), VALIDATION_FAILED (over 72 bytes)
     */
    public void resetPassword(String email, String code, String newPassword) {
        if (newPassword.getBytes(StandardCharsets.UTF_8).length > AuthService.MAX_PASSWORD_BYTES) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("newPassword", "must be at most 72 bytes")));
        }
        Optional<User> account = users.findByEmail(EmailAddresses.normalize(email)).filter(user -> user.getStatus() == UserStatus.ACTIVE);
        if (account.isEmpty()) {
            throw new ApiException(ErrorCode.INVALID_RESET_CODE);
        }
        int userId = account.get().getId();
        String key = limiterKey(userId);
        if (wrongCodes.isBlocked(key)) {
            throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, "Too many wrong codes. Request a new code.");
        }
        byte[] digest = hasher.hashResetCode(userId, code);
        String newHash = passwordEncoder.encode(newPassword);   // outside the transaction: BCrypt is slow
        Boolean changed = transaction.execute(status -> {
            LocalDateTime now = nowUtc();
            if (tokens.consume(userId, digest, now) != 1) {
                return false;
            }
            tokens.closeOpenCodes(userId, now);
            User user = users.findById(userId).orElseThrow();
            user.resetPassword(newHash, now);
            users.save(user);
            return true;
        });
        if (Boolean.TRUE.equals(changed)) {
            wrongCodes.reset(key);
            authService.clearFailedLogins(account.get().getEmail());
            log.info("Password reset for user {}", userId);
            return;
        }
        int failures = wrongCodes.recordFailure(key);
        if (failures >= wrongCodes.maxFailures()) {
            transaction.executeWithoutResult(status -> tokens.closeOpenCodes(userId, nowUtc()));
            log.warn("Password-reset code of user {} closed after {} wrong attempts", userId, failures);
            throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, "Too many wrong codes. Request a new code.");
        }
        throw new ApiException(ErrorCode.INVALID_RESET_CODE);
    }

    private Optional<VerificationMailer.IssuedCode> issueIfAllowed(String email) {
        Optional<User> account = users.findByEmail(EmailAddresses.normalize(email)).filter(user -> user.getStatus() == UserStatus.ACTIVE);
        if (account.isEmpty()) {
            return Optional.empty();
        }
        User user = account.get();
        LocalDateTime now = nowUtc();
        boolean tooSoon = tokens.findTopByUserIdOrderByCreatedAtDescIdDesc(user.getId())
                .map(last -> last.getCreatedAt().isAfter(now.minus(settings.resendCooldown())))
                .orElse(false);
        boolean hourlyLimit = tokens.countByUserIdAndCreatedAtAfter(user.getId(), now.minusHours(1)) >= settings.maxCodesPerHour();
        if (tooSoon || hourlyLimit) {
            log.info("Password-reset code for user {} refused by the {} limit", user.getId(), tooSoon ? "cooldown" : "hourly");
            return Optional.empty();
        }
        tokens.closeOpenCodes(user.getId(), now);
        String code;
        byte[] digest;
        do {
            code = hasher.newCode();
            digest = hasher.hashResetCode(user.getId(), code);
        } while (tokens.existsByTokenHash(digest));
        LocalDateTime expiresAt = now.plus(settings.codeTtl());
        tokens.save(new PasswordResetToken(user.getId(), digest, now, expiresAt));
        wrongCodes.reset(limiterKey(user.getId()));
        log.info("Password-reset code issued for user {}", user.getId());
        return Optional.of(new VerificationMailer.IssuedCode(user.getId(), user.getEmail(), user.getFullName(), code,
                expiresAt.toInstant(ZoneOffset.UTC)));
    }

    private LocalDateTime nowUtc() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String limiterKey(int userId) {
        return "reset:" + userId;
    }
}
