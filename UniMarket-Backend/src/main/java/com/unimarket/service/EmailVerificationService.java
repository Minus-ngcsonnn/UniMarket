package com.unimarket.service;

import com.unimarket.common.ErrorCode;
import com.unimarket.config.SecurityProperties;
import com.unimarket.entity.EmailVerificationToken;
import com.unimarket.entity.User;
import com.unimarket.entity.UserStatus;
import com.unimarket.exception.ApiException;
import com.unimarket.repository.EmailVerificationTokenRepository;
import com.unimarket.repository.UserRepository;
import com.unimarket.security.AttemptLimiter;
import com.unimarket.security.VerificationCodeHasher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

/**
 * Student email verification with one-time 6-digit codes ({@code dbo.EmailVerificationTokens}).
 *
 * <ul>
 *   <li>Codes are random ({@code SecureRandom}), valid for {@code codeTtl} (10 minutes), stored only as
 *       an HMAC digest, and single-use (the database procedure {@code usp_VerifyEmail} consumes them).</li>
 *   <li>A new code closes all older codes of the account.</li>
 *   <li>Wrong codes: after {@code maxAttempts} (5) the current code is closed in the database and a new
 *       one must be requested. Resends: at most one per {@code resendCooldown} (60 s) and
 *       {@code maxCodesPerHour} (5) per account, counted from the table itself.</li>
 *   <li>Responses never reveal whether an email is registered or already verified.</li>
 * </ul>
 */
@Service
@Profile("!nodb")
public class EmailVerificationService {

    /** SQL Server error raised by {@code usp_VerifyEmail} for an unknown, used or expired code. */
    static final int SQL_INVALID_TOKEN = 51003;

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationService.class);

    private final UserRepository users;
    private final EmailVerificationTokenRepository tokens;
    private final VerificationCodeHasher hasher;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final ApplicationEventPublisher events;
    private final SecurityProperties.Verification settings;
    private final Clock clock;
    private final AttemptLimiter wrongCodes;

    public EmailVerificationService(UserRepository users, EmailVerificationTokenRepository tokens, VerificationCodeHasher hasher,
                                    JdbcTemplate jdbc, PlatformTransactionManager transactionManager, ApplicationEventPublisher events,
                                    SecurityProperties properties, Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.hasher = hasher;
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.events = events;
        this.settings = properties.verification();
        this.clock = clock;
        this.wrongCodes = new AttemptLimiter(settings.maxAttempts(), settings.codeTtl(), clock);
    }

    /**
     * Issues a new code for an account inside the caller's transaction and schedules the e-mail
     * for after commit. Older open codes of the account are closed.
     *
     * @param user an unverified account (already saved)
     * @return expiry of the new code (UTC)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LocalDateTime issueCode(User user) {
        LocalDateTime now = nowUtc();
        tokens.closeOpenCodes(user.getId(), now);
        String code;
        byte[] digest;
        do {   // digests are UNIQUE in the table; a clash for the same user is ~1 in a million
            code = hasher.newCode();
            digest = hasher.hash(user.getId(), code);
        } while (tokens.existsByTokenHash(digest));
        LocalDateTime expiresAt = now.plus(settings.codeTtl());
        tokens.save(new EmailVerificationToken(user.getId(), digest, now, expiresAt));
        wrongCodes.reset(limiterKey(user.getId()));
        events.publishEvent(new VerificationCodeIssuedEvent(user.getEmail(), user.getFullName(), code, expiresAt.toInstant(ZoneOffset.UTC)));
        return expiresAt;
    }

    /**
     * Verifies an account with the code it received. Runs {@code usp_VerifyEmail}, which atomically
     * consumes the code and sets {@code Users.EmailVerifiedAt}.
     *
     * @param email account email (any case)
     * @param code  6-digit code
     * @throws ApiException INVALID_VERIFICATION_CODE (wrong, used, expired code, unknown or already
     *                      verified account) or TOO_MANY_ATTEMPTS (code closed after too many failures)
     */
    public void verify(String email, String code) {
        Optional<User> account = users.findByEmail(EmailAddresses.normalize(email))
                .filter(user -> user.getEmailVerifiedAt() == null && user.getStatus() == UserStatus.ACTIVE);
        if (account.isEmpty()) {
            throw new ApiException(ErrorCode.INVALID_VERIFICATION_CODE);
        }
        int userId = account.get().getId();
        String key = limiterKey(userId);
        if (wrongCodes.isBlocked(key)) {
            throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, "Too many wrong codes. Request a new code.");
        }
        try {
            jdbc.update("EXEC dbo.usp_VerifyEmail ?", (Object) hasher.hash(userId, code));
            wrongCodes.reset(key);
            log.info("Email verified for user {}", userId);
        } catch (DataAccessException ex) {
            if (sqlErrorCode(ex) != SQL_INVALID_TOKEN) {
                throw ex;
            }
            int failures = wrongCodes.recordFailure(key);
            if (failures >= wrongCodes.maxFailures()) {
                transaction.executeWithoutResult(status -> tokens.closeOpenCodes(userId, nowUtc()));
                log.warn("Verification code of user {} closed after {} wrong attempts", userId, failures);
                throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, "Too many wrong codes. Request a new code.");
            }
            throw new ApiException(ErrorCode.INVALID_VERIFICATION_CODE);
        }
    }

    /**
     * Sends a new code when the account exists, is active, is not verified yet and the resend limits
     * allow it. Otherwise does nothing, so the caller cannot learn whether an email is registered.
     *
     * @param email account email (any case)
     * @return true when a new code was issued (for logging/tests only, never sent to clients)
     */
    @Transactional
    public boolean resend(String email) {
        Optional<User> account = users.findByEmail(EmailAddresses.normalize(email))
                .filter(user -> user.getEmailVerifiedAt() == null && user.getStatus() == UserStatus.ACTIVE);
        if (account.isEmpty()) {
            return false;
        }
        User user = account.get();
        LocalDateTime now = nowUtc();
        boolean tooSoon = tokens.findTopByUserIdOrderByCreatedAtDescIdDesc(user.getId())
                .map(last -> last.getCreatedAt().isAfter(now.minus(settings.resendCooldown())))
                .orElse(false);
        boolean hourlyLimit = tokens.countByUserIdAndCreatedAtAfter(user.getId(), now.minusHours(1)) >= settings.maxCodesPerHour();
        if (tooSoon || hourlyLimit) {
            log.info("Resend for user {} refused by the {} limit", user.getId(), tooSoon ? "cooldown" : "hourly");
            return false;
        }
        issueCode(user);
        return true;
    }

    private LocalDateTime nowUtc() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String limiterKey(int userId) {
        return "verify:" + userId;
    }

    private static int sqlErrorCode(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                return sql.getErrorCode();
            }
        }
        return -1;
    }
}
