package com.unimarket.service;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.config.SecurityProperties;
import com.unimarket.dto.auth.LoginRequest;
import com.unimarket.dto.auth.LoginResponse;
import com.unimarket.dto.auth.RegisterRequest;
import com.unimarket.dto.auth.RegisterResponse;
import com.unimarket.dto.auth.UserResponse;
import com.unimarket.entity.Campus;
import com.unimarket.entity.LocationZone;
import com.unimarket.entity.User;
import com.unimarket.entity.UserStatus;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.repository.CampusRepository;
import com.unimarket.repository.LocationZoneRepository;
import com.unimarket.repository.UserRepository;
import com.unimarket.security.AttemptLimiter;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Student registration, login and the current account.
 *
 * <p>Registration (team decision, Nov 2026: students from universities and colleges across Vietnam) accepts ANY
 * valid email address — Gmail, Outlook, Yahoo, institutional or other domains. The email domain is never used to
 * decide eligibility or university affiliation. The student chooses their campus explicitly from the campuses that
 * exist in {@code dbo.Campuses}; nothing is assigned automatically. The account is created as an active, unverified
 * STUDENT (never ADMIN) and a verification code is e-mailed: the code proves ownership of the email address, NOT
 * student enrolment (there is no verified-student status). Login requires a verified, active account and
 * returns a signed access token. Unknown emails and wrong passwords get the same answer.</p>
 */
@Service
@Profile("!nodb")
public class AuthService {

    /** BCrypt only uses the first 72 bytes of a password; longer ones are refused. */
    static final int MAX_PASSWORD_BYTES = 72;

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final CampusRepository campuses;
    private final LocationZoneRepository zones;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationService verification;
    private final VerificationMailer mailer;
    private final TransactionTemplate transaction;
    private final JwtService jwtService;
    private final Clock clock;
    private final AttemptLimiter failedLogins;
    /** Compared against when the email is unknown, so both cases take the same time. */
    private final String dummyHash;

    public AuthService(UserRepository users, CampusRepository campuses, LocationZoneRepository zones,
                       PasswordEncoder passwordEncoder, EmailVerificationService verification, VerificationMailer mailer,
                       PlatformTransactionManager transactionManager, JwtService jwtService,
                       SecurityProperties properties, Clock clock) {
        this.users = users;
        this.campuses = campuses;
        this.zones = zones;
        this.passwordEncoder = passwordEncoder;
        this.verification = verification;
        this.mailer = mailer;
        this.transaction = new TransactionTemplate(transactionManager);
        this.jwtService = jwtService;
        this.clock = clock;
        this.failedLogins = new AttemptLimiter(properties.login().maxFailures(), properties.login().lockout(), clock);
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * Registers a student and e-mails a verification code.
     *
     * @param request validated registration data
     * @return the new account (unverified) and the code expiry
     * @throws ApiException INVALID_CAMPUS, EMAIL_ALREADY_REGISTERED, VALIDATION_FAILED
     */
    public RegisterResponse register(RegisterRequest request) {
        // 1) Account + code in ONE transaction. 2) After the commit, the e-mail is sent outside the transaction and
        // its real outcome is returned (a provider failure never rolls back the account and never reports "sent";
        // the student then requests a new code — registering again would answer EMAIL_ALREADY_REGISTERED).
        Registered registered = transaction.execute(status -> createAccount(request));
        VerificationMailer.Delivery delivery = mailer.deliver(registered.code());
        RegisterResponse created = registered.response();
        return new RegisterResponse(created.user(), created.verificationRequired(), created.codeExpiresAt(), delivery.name());
    }

    private record Registered(RegisterResponse response, VerificationMailer.IssuedCode code) {
    }

    private Registered createAccount(RegisterRequest request) {
        String email = EmailAddresses.normalize(request.email());
        if (request.password().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("password", "must be at most 72 bytes")));
        }
        // V003: an official campus (must exist) OR a self-declared university name; never derived from the email or
        // defaulted, and a typed name is never matched to / inserted into Universities.
        Campus campus = request.campusId() == null ? null
                : campuses.findById(request.campusId()).orElseThrow(() -> new ApiException(ErrorCode.INVALID_CAMPUS));
        String declaredUniversity = campus == null ? request.normalizedUniversityName() : null;
        LocationZone homeZone = request.homeZoneId() == null ? null
                : zones.findById(request.homeZoneId()).filter(LocationZone::isActive)
                        .orElseThrow(() -> new ApiException(ErrorCode.INVALID_ZONE));
        if (users.existsByEmail(email)) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED);
        }
        User user = User.newStudent(email, passwordEncoder.encode(request.password()), request.fullName().trim(), campus,
                declaredUniversity, homeZone, nowUtc());
        try {
            user = users.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            // Two registrations with the same email at the same time: UNIQUE(Email) decides.
            throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED);
        }
        VerificationMailer.IssuedCode code = verification.issueCode(user);
        log.info("Registered student {} ({})", user.getId(), campus != null ? "campus " + campus.getId() : "self-declared university");
        return new Registered(new RegisterResponse(UserResponse.from(user), true, code.expiresAt(), null), code);
    }

    /**
     * Signs in with email and password.
     *
     * @param request validated credentials
     * @return access token and account
     * @throws ApiException INVALID_CREDENTIALS (401), TOO_MANY_ATTEMPTS (429), and only after a correct
     *                      password: EMAIL_NOT_VERIFIED or ACCOUNT_DISABLED (403)
     */
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        String email = EmailAddresses.normalize(request.email());
        String key = "login:" + email;
        if (failedLogins.isBlocked(key)) {
            throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS);
        }
        User user = users.findByEmail(email).orElse(null);
        boolean passwordMatches = passwordEncoder.matches(request.password(), user == null ? dummyHash : user.getPasswordHash());
        if (user == null || !passwordMatches) {
            failedLogins.recordFailure(key);
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        failedLogins.reset(key);
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_DISABLED);
        }
        if (user.getEmailVerifiedAt() == null) {
            throw new ApiException(ErrorCode.EMAIL_NOT_VERIFIED);
        }
        JwtService.AccessToken token = jwtService.issueAccessToken(user);
        User withCampus = users.findWithCampusById(user.getId()).orElseThrow();
        return new LoginResponse(token.value(), "Bearer", token.expiresInSeconds(), token.expiresAt(), UserResponse.from(withCampus));
    }

    /**
     * Signs in an account right after its email was verified with the e-mailed code (no second password entry).
     * Only called by the verify-email endpoint AFTER {@code usp_VerifyEmail} consumed a valid code: the code proves
     * ownership of the address, and the password was set by the same person at registration. The usual checks still
     * apply (active and verified) and the token is the same short-lived access token as a normal login.
     *
     * @param userId the account that was just verified
     * @return access token and account
     * @throws ApiException ACCOUNT_DISABLED / EMAIL_NOT_VERIFIED when the account cannot sign in
     */
    @Transactional(readOnly = true)
    public LoginResponse signInVerified(int userId) {
        User user = users.findWithCampusById(userId).orElseThrow(() -> new ApiException(ErrorCode.INVALID_VERIFICATION_CODE));
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_DISABLED);
        }
        if (user.getEmailVerifiedAt() == null) {
            throw new ApiException(ErrorCode.EMAIL_NOT_VERIFIED);
        }
        failedLogins.reset("login:" + user.getEmail());
        JwtService.AccessToken token = jwtService.issueAccessToken(user);
        return new LoginResponse(token.value(), "Bearer", token.expiresInSeconds(), token.expiresAt(), UserResponse.from(user));
    }

    /**
     * Clears the failed-login lockout of an email, e.g. after its password was reset with an e-mailed code.
     *
     * @param email account email (any case)
     */
    public void clearFailedLogins(String email) {
        failedLogins.reset("login:" + EmailAddresses.normalize(email));
    }

    /**
     * @param principal the signed-in account
     * @return its public profile
     */
    @Transactional(readOnly = true)
    public UserResponse currentUser(AuthenticatedUser principal) {
        return users.findWithCampusById(principal.id())
                .map(UserResponse::from)
                .orElseThrow(() -> new ApiException(ErrorCode.AUTHENTICATION_REQUIRED));
    }

    private LocalDateTime nowUtc() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
