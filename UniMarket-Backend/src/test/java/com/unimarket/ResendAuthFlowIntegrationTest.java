package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.support.MockResendServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Registration → e-mailed code → verification → sign-in with MAIL_MODE=resend against a LOCAL MOCK of the Resend API
 * (no real e-mail, dummy key). Writes data: only on a *Test database copy (UNIMARKET_AUTH_IT=true).
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_AUTH_IT", matches = "true")
@SpringBootTest(properties = {
        "unimarket.mail.mode=resend",
        "unimarket.mail.resend.api-key=" + ResendAuthFlowIntegrationTest.DUMMY_KEY,
        "unimarket.mail.resend.from-email=no-reply@unimarket.test",
        "unimarket.mail.resend.timeout=PT1S"})
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ResendAuthFlowIntegrationTest {

    static final String DUMMY_KEY = "re_integration_dummy_key_not_real";
    private static final MockResendServer RESEND = new MockResendServer();
    private static final Pattern CODE = Pattern.compile("Mã xác thực email của bạn là: (\\d{6})");

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void resendUrl(DynamicPropertyRegistry registry) {
        registry.add("unimarket.mail.resend.api-url", RESEND::baseUrl);
    }

    @BeforeAll
    void onlyOnATestCopy() {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
    }

    @AfterAll
    void stopMock() {
        RESEND.close();
    }

    @BeforeEach
    void accept() {
        RESEND.accept();
    }

    @Test
    void realModeHappyPath(CapturedOutput output) throws Exception {
        String email = newEmail();
        String body = register(email).andExpect(status().isCreated())
                .andExpect(jsonPath("$.emailDelivery").value("SENT"))
                .andExpect(jsonPath("$.verificationRequired").value(true))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        MockResendServer.Request sent = RESEND.last();
        assertThat(sent.authorization()).isEqualTo("Bearer " + DUMMY_KEY);
        JsonNode payload = json.readTree(sent.body());
        assertThat(payload.get("to").get(0).asText()).isEqualTo(email);
        assertThat(payload.get("from").asText()).isEqualTo("UniMarket <no-reply@unimarket.test>");
        assertThat(payload.get("html").asText()).contains("Chào mừng").contains("10 phút");
        String code = codeIn(sent);
        assertThat(body).as("the API never returns the code").doesNotContain(code);

        verify(email, code.equals("000000") ? "111111" : "000000").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        verify(email, code).andExpect(status().isOk());
        verify(email, code).andExpect(status().isBadRequest());   // single use
        String token = login(email).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)
                .transform(this::accessToken);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.emailVerified").value(true));

        assertThat(output.getAll()).as("real-mail mode never logs codes or the API key")
                .doesNotContain(code).doesNotContain(DUMMY_KEY).doesNotContain("DEV E-MAIL");
    }

    @Test
    void anUnverifiedSenderDomainIsReportedAndTheAccountCanStillBeVerifiedLater() throws Exception {
        String email = newEmail();
        RESEND.refuse(403, "validation_error", "The unimarket.test domain is not verified.");
        register(email).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE Email = ? AND EmailVerifiedAt IS NULL", Integer.class, email))
                .as("the account exists, unverified (no duplicate is created on retry)").isEqualTo(1);

        // Registering again is refused (no second account); the way forward is "resend code".
        register(email).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE Email = ?", Integer.class, email)).isEqualTo(1);

        // Within the 60 s cooldown nothing is sent (same generic 202).
        int before = RESEND.requests().size();
        resend(email).andExpect(status().isAccepted());
        assertThat(RESEND.requests()).hasSize(before);

        // After the cooldown, a still-failing provider → 503, and the undelivered code is closed.
        ageCodes(email);
        resend(email).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("EMAIL_DELIVERY_FAILED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId "
                + "WHERE u.Email = ? AND t.ConsumedAt IS NULL", Integer.class, email)).isZero();

        // Provider fixed: resend after the cooldown delivers a new code that verifies the account.
        RESEND.accept();
        ageCodes(email);
        resend(email).andExpect(status().isAccepted());
        verify(email, codeIn(RESEND.last())).andExpect(status().isOk());
        login(email).andExpect(status().isOk());
    }

    @Test
    void timeoutsRateLimitsAndBadKeysAreFailuresNotSuccesses() throws Exception {
        RESEND.delay(2_500);   // client timeout is 1 s
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        RESEND.refuse(429, "rate_limit_exceeded", "Too many requests.");
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        RESEND.refuse(401, "invalid_api_key", "API key is invalid");
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
    }

    @Test
    void anExpiredCodeIsRejected() throws Exception {
        String email = newEmail();
        register(email).andExpect(status().isCreated());
        String code = codeIn(RESEND.last());
        jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -11, SYSUTCDATETIME()), ExpiresAt = DATEADD(minute, -1, SYSUTCDATETIME()) "
                + "FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ? AND t.ConsumedAt IS NULL", email);
        verify(email, code).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        login(email).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void unknownEmailsGetTheSameResendAnswerAndNoProviderCall() throws Exception {
        int before = RESEND.requests().size();
        resend("nobody-" + UUID.randomUUID() + "@gmail.com").andExpect(status().isAccepted());
        RESEND.refuse(500, "application_error", "down");
        resend("nobody-" + UUID.randomUUID() + "@gmail.com").andExpect(status().isAccepted());
        assertThat(RESEND.requests()).hasSize(before);
    }

    // ------------------------------------------------------------------ helpers

    private static String newEmail() {
        return "rs-" + UUID.randomUUID().toString().substring(0, 12) + "@gmail.com";
    }

    private ResultActions register(String email) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                "fullName", "Resend Tester", "email", email, "password", "Secret123", "universityName", "Trường Đại học Cần Thơ"))));
    }

    private ResultActions verify(String email, String code) throws Exception {
        return mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "code", code))));
    }

    private ResultActions resend(String email) throws Exception {
        return mvc.perform(post("/api/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email))));
    }

    private ResultActions login(String email) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", "Secret123"))));
    }

    private String accessToken(String loginBody) {
        try {
            return json.readTree(loginBody).get("accessToken").asText();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private String codeIn(MockResendServer.Request request) throws Exception {
        Matcher m = CODE.matcher(json.readTree(request.body()).get("text").asText());
        assertThat(m.find()).as("code in the e-mail text").isTrue();
        return m.group(1);
    }

    /** Makes the account's codes look older than the 60 s cooldown (test database only). */
    private void ageCodes(String email) {
        jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -2, t.CreatedAt), ExpiresAt = DATEADD(minute, -2, t.ExpiresAt) "
                + "FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ?", email);
    }
}
