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
import com.unimarket.entity.University;
import com.unimarket.entity.User;
import com.unimarket.entity.UserStatus;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.repository.CampusRepository;
import com.unimarket.repository.UniversityEmailDomainRepository;
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
import org.springframework.transaction.annotation.Transactional;

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
 * <p>Registration accepts only institutional emails whose domain is listed in
 * {@code dbo.UniversityEmailDomains}; the account is created as an active, unverified STUDENT
 * (never ADMIN) and a verification code is e-mailed. Login requires a verified, active account and
 * returns a signed access token. Unknown emails and wrong passwords get the same answer.</p>
 */
@Service
@Profile("!nodb")
public class AuthService {

    /** BCrypt only uses the first 72 bytes of a password; longer ones are refused. */
    static final int MAX_PASSWORD_BYTES = 72;

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final UniversityEmailDomainRepository domains;
    private final CampusRepository campuses;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationService verification;
    private final JwtService jwtService;
    private final Clock clock;
    private final AttemptLimiter failedLogins;
    /** Compared against when the email is unknown, so both cases take the same time. */
    private final String dummyHash;

    public AuthService(UserRepository users, UniversityEmailDomainRepository domains, CampusRepository campuses,
                       PasswordEncoder passwordEncoder, EmailVerificationService verification, JwtService jwtService,
                       SecurityProperties properties, Clock clock) {
        this.users = users;
        this.domains = domains;
        this.campuses = campuses;
        this.passwordEncoder = passwordEncoder;
        this.verification = verification;
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
     * @throws ApiException UNSUPPORTED_EMAIL_DOMAIN, INVALID_CAMPUS, EMAIL_ALREADY_REGISTERED, VALIDATION_FAILED
     */
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        String email = EmailAddresses.normalize(request.email());
        if (request.password().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("password", "must be at most 72 bytes")));
        }
        University university = domains.findWithUniversityByDomain(EmailAddresses.domainOf(email))
                .orElseThrow(() -> new ApiException(ErrorCode.UNSUPPORTED_EMAIL_DOMAIN))
                .getUniversity();
        Campus campus = resolveCampus(university, request.campusId());
        if (users.existsByEmail(email)) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED);
        }
        User user = User.newStudent(email, passwordEncoder.encode(request.password()), request.fullName().trim(), campus, nowUtc());
        try {
            user = users.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            // Two registrations with the same email at the same time: UNIQUE(Email) decides.
            throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED);
        }
        LocalDateTime codeExpiresAt = verification.issueCode(user);
        log.info("Registered student {} at campus {}", user.getId(), campus.getId());
        return new RegisterResponse(UserResponse.from(user), true, codeExpiresAt.toInstant(ZoneOffset.UTC));
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
     * @param principal the signed-in account
     * @return its public profile
     */
    @Transactional(readOnly = true)
    public UserResponse currentUser(AuthenticatedUser principal) {
        return users.findWithCampusById(principal.id())
                .map(UserResponse::from)
                .orElseThrow(() -> new ApiException(ErrorCode.AUTHENTICATION_REQUIRED));
    }

    /** A given campus must belong to the email's university; without one, a single-campus university is used. */
    private Campus resolveCampus(University university, Integer campusId) {
        List<Campus> options = campuses.findByUniversity_Id(university.getId());
        if (campusId == null) {
            if (options.size() == 1) {
                return options.get(0);
            }
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("campusId", "is required for this university")));
        }
        return options.stream()
                .filter(campus -> campus.getId().equals(campusId))
                .findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_CAMPUS));
    }

    private LocalDateTime nowUtc() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
