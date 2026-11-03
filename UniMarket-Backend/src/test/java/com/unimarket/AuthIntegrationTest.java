package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.service.mail.EmailSender;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end authentication tests against a real SQL Server database.
 *
 * <p>These tests INSERT and UPDATE rows, so they run only when {@code UNIMARKET_AUTH_IT=true} and refuse
 * to start unless the connected database name contains "Test" (a disposable copy made with
 * {@code database/tests/create_test_copy.sql}). Every account they create uses a random
 * {@code it-...@fpt.edu.vn} address; the 17 demo accounts are only read, and their rows are compared
 * before and after the run.</p>
 *
 * <p>Demo sign-in checks additionally need {@code UNIMARKET_DEMO_PASSWORD} (never stored in the repository).</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_AUTH_IT", matches = "true")
@SpringBootTest
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AuthIntegrationTest {

    private static final Pattern CODE = Pattern.compile("verification code is: (\\d{6})");

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtEncoder jwtEncoder;
    @Autowired private CapturingEmailSender mail;

    private Integer demoUsersChecksum;

    /** Captures e-mails instead of logging them, so tests can read the code. */
    @TestConfiguration
    static class MailCapture {
        @Bean
        @Primary
        CapturingEmailSender capturingEmailSender() {
            return new CapturingEmailSender();
        }
    }

    static class CapturingEmailSender implements EmailSender {
        final List<String[]> sent = new CopyOnWriteArrayList<>();

        @Override
        public void send(String to, String subject, String body) {
            sent.add(new String[] {to, subject, body});
        }

        String lastCodeFor(String email) {
            for (int i = sent.size() - 1; i >= 0; i--) {
                if (sent.get(i)[0].equals(email)) {
                    Matcher m = CODE.matcher(sent.get(i)[2]);
                    if (m.find()) {
                        return m.group(1);
                    }
                }
            }
            throw new AssertionError("No code e-mailed to " + email);
        }

        long countFor(String email) {
            return sent.stream().filter(m -> m[0].equals(email)).count();
        }
    }

    @BeforeAll
    void refuseToRunOutsideATestDatabase() {
        String database = jdbc.queryForObject("SELECT DB_NAME()", String.class);
        assertThat(database).as("AuthIntegrationTest writes data: run it only on a *Test copy").contains("Test");
        demoUsersChecksum = demoUsersChecksum();
    }

    @AfterAll
    void demoAccountsAreUnchanged() {
        assertThat(demoUsersChecksum()).as("demo users (UserId 1-17) must not be modified").isEqualTo(demoUsersChecksum);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE UserId <= 17", Integer.class)).isEqualTo(17);
    }

    // ------------------------------------------------------------------ registration

    @Nested
    class Registration {

        @Test
        void validStudentRegistrationCreatesAnUnverifiedStudentAndMailsACode() throws Exception {
            String email = newEmail();
            register(email, "Secret123", "Nguyen Van Test")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.user.email").value(email))
                    .andExpect(jsonPath("$.user.role").value("STUDENT"))
                    .andExpect(jsonPath("$.user.emailVerified").value(false))
                    .andExpect(jsonPath("$.user.campusName").value("FPT Hoa Lac"))
                    .andExpect(jsonPath("$.user.university").value("FPT University"))
                    .andExpect(jsonPath("$.verificationRequired").value(true))
                    .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                    .andExpect(jsonPath("$.code").doesNotExist());
            Map<String, Object> row = jdbc.queryForMap("SELECT Role, Status, EmailVerifiedAt FROM dbo.Users WHERE Email = ?", email);
            assertThat(row).containsEntry("Role", "Student").containsEntry("Status", "Active");
            assertThat(row.get("EmailVerifiedAt")).isNull();
            assertThat(mail.lastCodeFor(email)).matches("\\d{6}");
            // Times are stored as UTC without any time-zone shift (regression: a +7 h shift once made new codes expired).
            Map<String, Object> times = jdbc.queryForMap("SELECT DATEDIFF(second, u.CreatedAt, SYSUTCDATETIME()) AS userAge, "
                    + "DATEDIFF(second, SYSUTCDATETIME(), t.ExpiresAt) AS codeLeft FROM dbo.Users u JOIN dbo.EmailVerificationTokens t "
                    + "ON t.UserId = u.UserId WHERE u.Email = ?", email);
            assertThat((Integer) times.get("userAge")).isBetween(-5, 120);
            assertThat((Integer) times.get("codeLeft")).isBetween(480, 605);   // ~10 minutes
        }

        @Test
        void passwordIsStoredAsBcryptHashOnly() throws Exception {
            String email = newEmail();
            register(email, "Secret123", "Hash Check").andExpect(status().isCreated());
            String hash = jdbc.queryForObject("SELECT PasswordHash FROM dbo.Users WHERE Email = ?", String.class, email);
            assertThat(hash).startsWith("$2a$10$").doesNotContain("Secret123");
            assertThat(passwordEncoder.matches("Secret123", hash)).isTrue();
        }

        @Test
        void verificationCodeIsStoredOnlyAsADigest() throws Exception {
            String email = newEmail();
            register(email, "Secret123", "Digest Check").andExpect(status().isCreated());
            String code = mail.lastCodeFor(email);
            byte[] stored = jdbc.queryForObject("SELECT TOP 1 t.TokenHash FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId "
                    + "WHERE u.Email = ? ORDER BY t.TokenId DESC", byte[].class, email);
            assertThat(stored).hasSize(32);
            assertThat(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain(code);
        }

        @Test
        void duplicateEmailIsRejectedCaseInsensitively() throws Exception {
            String email = newEmail();
            register(email, "Secret123", "First").andExpect(status().isCreated());
            register(email.toUpperCase(), "Secret123", "Second")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
        }

        @Test
        void invalidEmailFormatIsRejected() throws Exception {
            register("not-an-email", "Secret123", "Bad Email")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("email"));
        }

        @Test
        void anyValidEmailDomainCanRegisterNationwide() throws Exception {
            // Team decision (Nov 2026): any valid email; the domain decides nothing (UniversityEmailDomains is not used).
            for (String domain : List.of("gmail.com", "outlook.com", "yahoo.com.vn", "hust.edu.vn", "student.uni-example.io", "sub.fpt.edu.vn")) {
                String email = "nationwide." + UUID.randomUUID().toString().substring(0, 8) + "@" + domain;
                register(email, "Secret123", "Nationwide " + domain)
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.user.email").value(email))
                        .andExpect(jsonPath("$.user.role").value("STUDENT"))
                        .andExpect(jsonPath("$.user.emailVerified").value(false))
                        .andExpect(jsonPath("$.user.campusId").value(campusId()))
                        .andExpect(jsonPath("$.user.verifiedStudent").doesNotExist())
                        .andExpect(jsonPath("$.user.verified").doesNotExist());
                assertThat(mail.lastCodeFor(email)).matches("\\d{6}");
            }
        }

        @Test
        void aGmailAccountVerifiesOwnershipSignsInAndIsStillNotAVerifiedStudent() throws Exception {
            String email = "personal." + UUID.randomUUID().toString().substring(0, 8) + "@gmail.com";
            register(email, "Secret123", "Gmail Student").andExpect(status().isCreated());
            verify(email, mail.lastCodeFor(email)).andExpect(status().isOk());
            String token = tokenFor(email, "Secret123");
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.emailVerified").value(true))
                    .andExpect(jsonPath("$.role").value("STUDENT"))
                    .andExpect(jsonPath("$.verifiedStudent").doesNotExist())
                    .andExpect(jsonPath("$.verified").doesNotExist());
        }

        @Test
        void theCampusIsChosenExplicitlyAndNeverDerivedOrDefaulted() throws Exception {
            // Neither a campus nor a typed university → 400 (V003: one affiliation required; never assigned automatically).
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                            "fullName", "No Campus", "email", newEmail(), "password", "Secret123"))))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("affiliationProvided"));
            // Only campuses that exist can be chosen; nothing is created on the fly.
            long campusesBefore = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Campuses", Long.class);
            long universitiesBefore = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Universities", Long.class);
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                            "fullName", "Unknown Campus", "email", "u." + UUID.randomUUID().toString().substring(0, 8) + "@gmail.com",
                            "password", "Secret123", "campusId", 999999))))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CAMPUS"));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Campuses", Long.class)).isEqualTo(campusesBefore);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Universities", Long.class)).isEqualTo(universitiesBefore);
        }

        @Test
        void addressesWithoutADottedDomainAreRejectedAsInvalidNotAsDuplicates() throws Exception {
            // @Email accepts "a@localhost" but the database CHECK needs a dotted domain: refuse it as a 400.
            register("someone@localhost", "Secret123", "No Dot")
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("email"));
        }

        @Test
        void missingAndWeakFieldsAreRejected() throws Exception {
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors.length()").value(4));
            register(newEmail(), "lettersonly", "Weak Password")
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("password"));
        }

        @Test
        void campusOfAnotherUniversityIsRejected() throws Exception {
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                            "fullName", "Wrong Campus", "email", newEmail(), "password", "Secret123", "campusId", 999999))))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CAMPUS"));
        }

        @Test
        void publicRegistrationCannotCreateAnAdmin() throws Exception {
            String email = newEmail();
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                            "fullName", "Wannabe Admin", "email", email, "password", "Secret123", "campusId", campusId(), "role", "Admin", "Role", "ADMIN"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.user.role").value("STUDENT"));
            assertThat(jdbc.queryForObject("SELECT Role FROM dbo.Users WHERE Email = ?", String.class, email)).isEqualTo("Student");
        }
    }

    // ------------------------------------------------------------------ verification

    @Nested
    class Verification {

        @Test
        void validCodeVerifiesAndThePersistedStatusChanges() throws Exception {
            String email = registered();
            verify(email, mail.lastCodeFor(email)).andExpect(status().isOk());
            assertThat(jdbc.queryForObject("SELECT EmailVerifiedAt FROM dbo.Users WHERE Email = ?", Object.class, email)).isNotNull();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId "
                    + "WHERE u.Email = ? AND t.ConsumedAt IS NULL", Integer.class, email)).isZero();
        }

        @Test
        void wrongCodeIsRejected() throws Exception {
            String email = registered();
            verify(email, otherCode(mail.lastCodeFor(email)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        }

        @Test
        void expiredCodeIsRejected() throws Exception {
            String email = registered();
            String code = mail.lastCodeFor(email);
            jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -11, SYSUTCDATETIME()), ExpiresAt = DATEADD(second, -1, SYSUTCDATETIME()) "
                    + "FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ?", email);
            verify(email, code).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        }

        @Test
        void aCodeCannotBeUsedTwice() throws Exception {
            String email = registered();
            String code = mail.lastCodeFor(email);
            verify(email, code).andExpect(status().isOk());
            verify(email, code).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        }

        @Test
        void unknownEmailGetsTheSameAnswerAsAWrongCode() throws Exception {
            verify(newEmail(), "123456").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        }

        @Test
        void fiveWrongCodesCloseTheCodeUntilANewOneIsRequested() throws Exception {
            String email = registered();
            String code = mail.lastCodeFor(email);
            for (int i = 0; i < 4; i++) {
                verify(email, otherCode(code)).andExpect(status().isBadRequest());
            }
            verify(email, otherCode(code)).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
            // The code is closed in the database, so even the right code no longer works.
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId "
                    + "WHERE u.Email = ? AND t.ConsumedAt IS NULL", Integer.class, email)).isZero();
            verify(email, code).andExpect(status().isTooManyRequests());
            // A new code (after the cooldown) works again.
            ageCodes(email, 2);
            resend(email);
            String newCode = mail.lastCodeFor(email);
            verify(email, newCode).andExpect(status().isOk());
        }

        @Test
        void resendRespectsTheCooldownAndClosesOlderCodes() throws Exception {
            String email = registered();
            String first = mail.lastCodeFor(email);
            resend(email);   // immediately: refused by the 60-second cooldown (same generic answer)
            assertThat(codesOf(email)).isEqualTo(1);
            assertThat(mail.countFor(email)).isEqualTo(1);

            ageCodes(email, 2);
            resend(email);
            assertThat(codesOf(email)).isEqualTo(2);
            String second = mail.lastCodeFor(email);
            verify(email, first).andExpect(status().isBadRequest());   // older code closed
            verify(email, second).andExpect(status().isOk());
        }

        @Test
        void resendIsLimitedToFiveCodesPerHour() throws Exception {
            String email = registered();
            Integer userId = jdbc.queryForObject("SELECT UserId FROM dbo.Users WHERE Email = ?", Integer.class, email);
            for (int i = 0; i < 4; i++) {   // 1 from registration + 4 = 5 codes in the last hour
                byte[] digest = new byte[32];
                new SecureRandom().nextBytes(digest);
                jdbc.update("INSERT dbo.EmailVerificationTokens (UserId, TokenHash, CreatedAt, ExpiresAt, ConsumedAt) "
                        + "VALUES (?, ?, DATEADD(minute, -10, SYSUTCDATETIME()), DATEADD(minute, -1, SYSUTCDATETIME()), SYSUTCDATETIME())", userId, digest);
            }
            ageCodes(email, 2);
            resend(email);
            assertThat(codesOf(email)).isEqualTo(5);
        }

        @Test
        void resendAnswersTheSameForUnknownAndVerifiedAccounts() throws Exception {
            String body = resend(newEmail());
            String verified = registered();
            verify(verified, mail.lastCodeFor(verified)).andExpect(status().isOk());
            assertThat(resend(verified)).isEqualTo(body);
        }
    }

    // ------------------------------------------------------------------ login and JWT

    @Nested
    class LoginAndTokens {

        @Test
        void verifiedStudentSignsInAndReadsTheirProfile() throws Exception {
            String email = verifiedStudent("Secret123");
            JsonNode login = login(email, "Secret123").andExpect(status().isOk())
                    .andExpect(jsonPath("$.tokenType").value("Bearer"))
                    .andExpect(jsonPath("$.expiresIn").value(3600))
                    .andExpect(jsonPath("$.user.email").value(email))
                    .andExpect(jsonPath("$.user.role").value("STUDENT"))
                    .andReturn().getResponse().getContentAsString().transform(AuthIntegrationTest.this::readTree);
            String token = login.get("accessToken").asText();
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.email").value(email))
                    .andExpect(jsonPath("$.emailVerified").value(true));
        }

        @Test
        void wrongPasswordAndUnknownEmailGetTheSameAnswer() throws Exception {
            String email = verifiedStudent("Secret123");
            String wrong = login(email, "Wrong1234").andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS")).andReturn().getResponse().getContentAsString();
            String unknown = login(newEmail(), "Wrong1234").andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS")).andReturn().getResponse().getContentAsString();
            assertThat(readTree(wrong).get("message")).isEqualTo(readTree(unknown).get("message"));
        }

        @Test
        void unverifiedAccountCannotSignIn() throws Exception {
            String email = registered();
            login(email, "Secret123").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
        }

        @Test
        void suspendedAccountCannotSignInAndItsTokenStopsWorking() throws Exception {
            String email = verifiedStudent("Secret123");
            String token = tokenFor(email, "Secret123");
            jdbc.update("UPDATE dbo.Users SET Status = 'Suspended' WHERE Email = ?", email);
            login(email, "Secret123").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        }

        @Test
        void fiveFailedLoginsLockTheEmailForAWhile() throws Exception {
            String email = verifiedStudent("Secret123");
            for (int i = 0; i < 5; i++) {
                login(email, "Wrong1234").andExpect(status().isUnauthorized());
            }
            login(email, "Secret123").andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
        }

        @Test
        void missingTokenIs401() throws Exception {
            mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
        }

        @Test
        void expiredTokenIs401() throws Exception {
            Integer userId = userIdOf(verifiedStudent("Secret123"));
            Instant past = Instant.now().minusSeconds(7200);
            String expired = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                    JwtClaimsSet.builder().issuer("unimarket-api").audience(List.of("unimarket-web")).subject(String.valueOf(userId))
                            .issuedAt(past).expiresAt(past.plusSeconds(3600)).build())).getTokenValue();
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + expired)).andExpect(status().isUnauthorized());
        }

        @Test
        void tokenSignedWithAnotherKeyIs401() throws Exception {
            Integer userId = userIdOf(verifiedStudent("Secret123"));
            byte[] otherKey = new byte[32];
            new SecureRandom().nextBytes(otherKey);
            JwtEncoder forger = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(otherKey, "HmacSHA256")));
            String forged = forger.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                    JwtClaimsSet.builder().issuer("unimarket-api").audience(List.of("unimarket-web")).subject(String.valueOf(userId))
                            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build())).getTokenValue();
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + forged)).andExpect(status().isUnauthorized());
        }

        @Test
        void studentIsForbiddenFromAdminEndpointsAndAdminIsAllowed() throws Exception {
            String student = tokenFor(verifiedStudent("Secret123"), "Secret123");
            mvc.perform(get("/api/admin/test-probe").header("Authorization", "Bearer " + student))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

            String adminEmail = newEmail();
            jdbc.update("INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, Role, Status, EmailVerifiedAt) "
                    + "VALUES (?, ?, N'Test Admin', 1, 'Admin', 'Active', SYSUTCDATETIME())", adminEmail, passwordEncoder.encode("Admin1234"));
            String admin = tokenFor(adminEmail, "Admin1234");
            mvc.perform(get("/api/admin/test-probe").header("Authorization", "Bearer " + admin))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("admin ok"));
            mvc.perform(get("/api/admin/test-probe")).andExpect(status().isUnauthorized());
        }

        @Test
        void publicEndpointsNeedNoToken() throws Exception {
            mvc.perform(get("/api/health")).andExpect(status().isOk());
            mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        }
    }

    // ------------------------------------------------------------------ demo accounts (read only)

    @Nested
    @EnabledIfEnvironmentVariable(named = "UNIMARKET_DEMO_PASSWORD", matches = ".+")
    class DemoAccounts {

        private final String password = System.getenv("UNIMARKET_DEMO_PASSWORD");

        @Test
        void verifiedDemoStudentAndDemoAdminCanSignIn() throws Exception {
            login("demo.student01@fpt.edu.vn", password).andExpect(status().isOk()).andExpect(jsonPath("$.user.role").value("STUDENT"));
            login("demo.admin@fpt.edu.vn", password).andExpect(status().isOk()).andExpect(jsonPath("$.user.role").value("ADMIN"));
        }

        @Test
        void unverifiedAndSuspendedDemoAccountsAreRefused() throws Exception {
            login("demo.student15@fpt.edu.vn", password).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
            login("demo.student16@fpt.edu.vn", password).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
        }
    }

    // ------------------------------------------------------------------ helpers

    private static String newEmail() {
        return "it-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20) + "@fpt.edu.vn";
    }

    /** Registers with an explicitly chosen, existing campus (nationwide policy: the campus is never defaulted). */
    private ResultActions register(String email, String password, String fullName) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", fullName, "email", email, "password", password, "campusId", campusId()))));
    }

    /** An existing campus of the test database. */
    private int campusId() {
        return jdbc.queryForObject("SELECT MIN(CampusId) FROM dbo.Campuses", Integer.class);
    }

    private String registered() throws Exception {
        String email = newEmail();
        register(email, "Secret123", "Integration Student").andExpect(status().isCreated());
        return email;
    }

    private String verifiedStudent(String password) throws Exception {
        String email = newEmail();
        register(email, password, "Verified Student").andExpect(status().isCreated());
        verify(email, mail.lastCodeFor(email)).andExpect(status().isOk());
        return email;
    }

    private ResultActions verify(String email, String code) throws Exception {
        return mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "code", code))));
    }

    private String resend(String email) throws Exception {
        return mvc.perform(post("/api/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email))))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private String tokenFor(String email, String password) throws Exception {
        return readTree(login(email, password).andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get("accessToken").asText();
    }

    private Integer userIdOf(String email) {
        return jdbc.queryForObject("SELECT UserId FROM dbo.Users WHERE Email = ?", Integer.class, email);
    }

    private int codesOf(String email) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ?",
                Integer.class, email);
    }

    /** Moves the account's codes {@code minutes} into the past (to get past the resend cooldown). */
    private void ageCodes(String email, int minutes) {
        jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -?, t.CreatedAt), ExpiresAt = DATEADD(minute, -?, t.ExpiresAt) "
                + "FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ?", minutes, minutes, email);
    }

    private static String otherCode(String code) {
        return code.equals("000000") ? "111111" : "000000";
    }

    private JsonNode readTree(String body) {
        try {
            return json.readTree(body);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private Integer demoUsersChecksum() {
        return jdbc.queryForObject("SELECT CHECKSUM_AGG(CHECKSUM(UserId, Email, PasswordHash, FullName, Role, Status, EmailVerifiedAt, "
                + "CampusId, Phone, ShowContact, UpdatedAt)) FROM dbo.Users WHERE UserId <= 17", Integer.class);
    }
}
