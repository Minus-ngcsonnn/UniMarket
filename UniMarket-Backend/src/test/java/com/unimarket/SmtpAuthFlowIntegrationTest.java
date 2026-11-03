package com.unimarket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.support.MockSmtpServer;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
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
 * Registration → e-mailed code → verification → sign-in with MAIL_MODE=smtp (the Gmail SMTP sender) against a LOCAL
 * MOCK SMTP server: dummy account, no TLS, no real e-mail. Writes data: only on a *Test copy (UNIMARKET_AUTH_IT=true).
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_AUTH_IT", matches = "true")
@SpringBootTest(properties = {
        "unimarket.mail.mode=smtp",
        "spring.mail.host=127.0.0.1",
        "spring.mail.username=" + SmtpAuthFlowIntegrationTest.SENDER,
        "spring.mail.password=" + SmtpAuthFlowIntegrationTest.APP_PASSWORD,
        "unimarket.mail.from=" + SmtpAuthFlowIntegrationTest.SENDER,
        "unimarket.mail.verify-on-startup=true",
        "spring.mail.properties.mail.smtp.starttls.enable=false",
        "spring.mail.properties.mail.smtp.starttls.required=false",
        "spring.mail.properties.mail.smtp.connectiontimeout=1000",
        "spring.mail.properties.mail.smtp.timeout=1000",
        "spring.mail.properties.mail.smtp.writetimeout=1000"})
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SmtpAuthFlowIntegrationTest {

    static final String SENDER = "unimarket.it.sender@gmail.com";
    static final String APP_PASSWORD = "dummy app password not real";
    private static final MockSmtpServer SMTP = new MockSmtpServer(SENDER, APP_PASSWORD);
    private static final Pattern CODE = Pattern.compile("Mã xác thực email của bạn là: (\\d{6})");
    private static final Pattern RESET_CODE = Pattern.compile("Mã đặt lại mật khẩu của bạn là: (\\d{6})");

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void smtpPort(DynamicPropertyRegistry registry) {
        registry.add("spring.mail.port", SMTP::port);
    }

    @BeforeAll
    void onlyOnATestCopy() {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
    }

    @AfterAll
    void stopMock() {
        SMTP.close();
    }

    @BeforeEach
    void accept() {
        SMTP.accept();
        SMTP.requirePassword(APP_PASSWORD);
    }

    @Test
    void registerVerifySignInWithRealSmtpMode(CapturedOutput output) throws Exception {
        String email = newEmail();
        String body = register(email).andExpect(status().isCreated())
                .andExpect(jsonPath("$.emailDelivery").value("SENT"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        MockSmtpServer.Received mail = SMTP.last();
        assertThat(mail.authUser()).isEqualTo(SENDER);
        assertThat(mail.rcptTo()).containsExactly("<" + email + ">");
        InternetAddress from = (InternetAddress) mail.mime().getFrom()[0];
        assertThat(from.getAddress()).isEqualTo(SENDER);
        assertThat(from.getPersonal()).isEqualTo("UniMarket");
        assertThat(mail.mime().getSubject()).isEqualTo("Mã xác thực UniMarket của bạn");
        assertThat(part(mail.mime(), "text/html")).contains("Chào mừng").contains("10 phút");
        String code = codeIn(mail);
        assertThat(body).as("the API never returns the code").doesNotContain(code);

        verify(email, code.equals("000000") ? "111111" : "000000").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        String verified = verify(email, code).andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + json.readTree(verified).get("accessToken").asText()))
                .andExpect(status().isOk());   // signed in right after verification
        verify(email, code).andExpect(status().isBadRequest());   // single use
        String token = json.readTree(login(email).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8)).get("accessToken").asText();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.emailVerified").value(true));

        assertThat(output.getAll()).as("SMTP mode never logs codes or the App Password")
                .doesNotContain(code).doesNotContain(APP_PASSWORD).doesNotContain("DEV E-MAIL");
    }

    @Test
    void aRejectedEmailIsReportedAndThePendingAccountRecoversThroughResend() throws Exception {
        String email = newEmail();
        SMTP.rejectRecipient();
        register(email).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE Email = ? AND EmailVerifiedAt IS NULL", Integer.class, email)).isEqualTo(1);

        register(email).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE Email = ?", Integer.class, email)).as("no duplicate account").isEqualTo(1);

        int before = SMTP.received().size();
        resend(email).andExpect(status().isAccepted());   // within the 60 s cooldown: nothing sent
        assertThat(SMTP.received()).hasSize(before);

        ageCodes(email);
        resend(email).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("EMAIL_DELIVERY_FAILED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId "
                + "WHERE u.Email = ? AND t.ConsumedAt IS NULL", Integer.class, email)).as("undelivered code closed").isZero();

        SMTP.accept();
        ageCodes(email);
        resend(email).andExpect(status().isAccepted());
        verify(email, codeIn(SMTP.last())).andExpect(status().isOk());
        login(email).andExpect(status().isOk());
    }

    @Test
    void authenticationFailuresLimitsUnavailabilityAndTimeoutsAreFailures() throws Exception {
        SMTP.requirePassword("rotated-app-password");   // the configured App Password is now wrong
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        SMTP.requirePassword(APP_PASSWORD);
        SMTP.sendingLimit();
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        SMTP.unavailable();
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
        SMTP.slow(2_500);   // client timeout 1 s
        register(newEmail()).andExpect(status().isCreated()).andExpect(jsonPath("$.emailDelivery").value("FAILED"));
    }

    @Test
    void anExpiredCodeIsRejected() throws Exception {
        String email = newEmail();
        register(email).andExpect(status().isCreated());
        String code = codeIn(SMTP.last());
        jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -11, SYSUTCDATETIME()), ExpiresAt = DATEADD(minute, -1, SYSUTCDATETIME()) "
                + "FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ? AND t.ConsumedAt IS NULL", email);
        verify(email, code).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_CODE"));
        login(email).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void unknownEmailsGetTheSameResendAnswerAndNoSmtpConnection() throws Exception {
        int before = SMTP.connections();
        resend("nobody-" + UUID.randomUUID() + "@gmail.com").andExpect(status().isAccepted());
        assertThat(SMTP.connections()).isEqualTo(before);
    }

    @Test
    void forgotPasswordMailsAResetCodeThroughSmtpAndFailuresAreReported(CapturedOutput output) throws Exception {
        String email = newEmail();
        register(email).andExpect(status().isCreated());
        verify(email, codeIn(SMTP.last())).andExpect(status().isOk());

        forgot(email).andExpect(status().isAccepted());
        MockSmtpServer.Received mail = SMTP.last();
        assertThat(mail.rcptTo()).containsExactly("<" + email + ">");
        assertThat(mail.mime().getSubject()).isEqualTo("Mã đặt lại mật khẩu UniMarket");
        Matcher m = RESET_CODE.matcher(part(mail.mime(), "text/plain"));
        assertThat(m.find()).isTrue();
        String code = m.group(1);
        assertThat(part(mail.mime(), "text/html")).contains("#2459e0").contains(code);
        mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "code", code, "newPassword", "Changed456"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", "Changed456")))).andExpect(status().isOk());

        // The provider refuses the next reset mail: 503, never "sent", and the undelivered code is closed.
        jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -2, t.CreatedAt) FROM dbo.PasswordResetTokens t "
                + "JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ?", email);
        SMTP.sendingLimit();
        forgot(email).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("EMAIL_DELIVERY_FAILED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.PasswordResetTokens t JOIN dbo.Users u ON u.UserId = t.UserId "
                + "WHERE u.Email = ? AND t.ConsumedAt IS NULL", Integer.class, email)).isZero();

        int before = SMTP.connections();
        forgot("nobody-" + UUID.randomUUID() + "@gmail.com").andExpect(status().isAccepted());
        assertThat(SMTP.connections()).as("unknown email: no SMTP connection").isEqualTo(before);
        assertThat(output.getAll()).doesNotContain(code).doesNotContain(APP_PASSWORD);
    }

    // ------------------------------------------------------------------ helpers

    private static String newEmail() {
        return "smtp-" + UUID.randomUUID().toString().substring(0, 12) + "@gmail.com";
    }

    private ResultActions register(String email) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                "fullName", "SMTP Tester", "email", email, "password", "Secret123", "universityName", "Trường Đại học Cần Thơ"))));
    }

    private ResultActions verify(String email, String code) throws Exception {
        return mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "code", code))));
    }

    private ResultActions resend(String email) throws Exception {
        return mvc.perform(post("/api/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email))));
    }

    private ResultActions forgot(String email) throws Exception {
        return mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email))));
    }

    private ResultActions login(String email) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", "Secret123"))));
    }

    private static String codeIn(MockSmtpServer.Received mail) throws Exception {
        Matcher m = CODE.matcher(part(mail.mime(), "text/plain"));
        assertThat(m.find()).as("code in the plain-text part").isTrue();
        return m.group(1);
    }

    private static String part(Part part, String type) throws Exception {
        if (part.isMimeType(type)) {
            return (String) part.getContent();
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                String found = part(multipart.getBodyPart(i), type);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }

    /** Makes the account's codes look older than the 60 s cooldown (test database only). */
    private void ageCodes(String email) {
        jdbc.update("UPDATE t SET CreatedAt = DATEADD(minute, -2, t.CreatedAt), ExpiresAt = DATEADD(minute, -2, t.ExpiresAt) "
                + "FROM dbo.EmailVerificationTokens t JOIN dbo.Users u ON u.UserId = t.UserId WHERE u.Email = ?", email);
    }
}
