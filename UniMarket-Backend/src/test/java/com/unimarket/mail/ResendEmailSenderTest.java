package com.unimarket.mail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.service.mail.EmailDeliveryException;
import com.unimarket.service.mail.EmailDeliveryException.Reason;
import com.unimarket.service.mail.EmailMessage;
import com.unimarket.service.mail.ResendEmailSender;
import com.unimarket.support.MockResendServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** Resend client against a local mock of the Resend API (no network, no real key, no real e-mail). */
class ResendEmailSenderTest {

    private static final String KEY = "re_unit_test_dummy_key_123";
    private final ObjectMapper json = new ObjectMapper();
    private MockResendServer resend;
    private ResendEmailSender sender;

    @BeforeEach
    void start() {
        resend = new MockResendServer();
        sender = new ResendEmailSender(KEY, "no-reply@unimarket.test", "UniMarket", resend.baseUrl(), Duration.ofMillis(800), json);
    }

    @AfterEach
    void stop() {
        resend.close();
    }

    private static EmailMessage message() {
        return new EmailMessage("student@gmail.com", "Mã xác thực UniMarket của bạn", "Mã: 123456", "<p>Mã: <b>123456</b> – Cần Thơ</p>");
    }

    @Test
    void anAcceptedMessageIsSentWithTheKeyOnlyInTheHeaderAndUtf8Content() throws Exception {
        sender.send(message());
        MockResendServer.Request request = resend.last();
        assertThat(request.authorization()).isEqualTo("Bearer " + KEY);
        assertThat(request.contentType()).contains("application/json").contains("utf-8");
        JsonNode body = json.readTree(request.body());
        assertThat(body.get("from").asText()).isEqualTo("UniMarket <no-reply@unimarket.test>");
        assertThat(body.get("to").get(0).asText()).isEqualTo("student@gmail.com");
        assertThat(body.get("subject").asText()).isEqualTo("Mã xác thực UniMarket của bạn");
        assertThat(body.get("html").asText()).contains("Cần Thơ");
        assertThat(body.get("text").asText()).isEqualTo("Mã: 123456");
        assertThat(request.body()).doesNotContain(KEY);
    }

    @Test
    void providerRefusalsAreClassifiedAndNeverReportedAsSent() {
        Object[][] cases = {
                {401, "missing_api_key", Reason.INVALID_CREDENTIALS},
                {403, "invalid_api_key", Reason.INVALID_CREDENTIALS},
                {403, "validation_error", Reason.SENDER_NOT_ALLOWED},   // unverified domain / testing sender restriction
                {422, "validation_error", Reason.INVALID_REQUEST},
                {429, "rate_limit_exceeded", Reason.RATE_LIMITED},
                {429, "daily_quota_exceeded", Reason.RATE_LIMITED},
                {500, "application_error", Reason.PROVIDER_ERROR},
        };
        for (Object[] c : cases) {
            resend.refuse((int) c[0], (String) c[1], "refused for the test");
            EmailDeliveryException ex = catchThrowableOfType(EmailDeliveryException.class, () -> sender.send(message()));
            assertThat(ex).as("HTTP %s %s", c[0], c[1]).isNotNull();
            assertThat(ex.reason()).as("HTTP %s %s", c[0], c[1]).isEqualTo(c[2]);
            assertThat(ex.status()).isEqualTo(c[0]);
            assertThat(ex.getMessage()).doesNotContain(KEY);
        }
    }

    @Test
    void aTwoHundredWithoutAnIdIsNotTreatedAsSent() {
        resend.refuse(200, "odd", "no id");
        assertThatThrownBy(() -> sender.send(message())).isInstanceOf(EmailDeliveryException.class);
    }

    @Test
    void aSlowProviderTimesOut() {
        resend.delay(2_000);
        EmailDeliveryException ex = catchThrowableOfType(EmailDeliveryException.class, () -> sender.send(message()));
        assertThat(ex.reason()).isEqualTo(Reason.TIMEOUT);
    }

    @Test
    void anUnreachableProviderIsANetworkFailure() {
        String url = resend.baseUrl();
        resend.close();
        ResendEmailSender offline = new ResendEmailSender(KEY, "no-reply@unimarket.test", "UniMarket", url, Duration.ofMillis(500), json);
        EmailDeliveryException ex = catchThrowableOfType(EmailDeliveryException.class, () -> offline.send(message()));
        assertThat(ex.reason()).isIn(Reason.NETWORK, Reason.TIMEOUT);
        resend = new MockResendServer();   // for @AfterEach
    }

    @Test
    void missingConfigurationFailsAtStartupWithoutFallingBackToLogging() {
        assertThatThrownBy(() -> new ResendEmailSender("", "no-reply@unimarket.test", "UniMarket", resend.baseUrl(), Duration.ofSeconds(1), json))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("RESEND_API_KEY");
        assertThatThrownBy(() -> new ResendEmailSender("  ", "no-reply@unimarket.test", "UniMarket", resend.baseUrl(), Duration.ofSeconds(1), json))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ResendEmailSender(KEY, "", "UniMarket", resend.baseUrl(), Duration.ofSeconds(1), json))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("RESEND_FROM_EMAIL").hasMessageNotContaining(KEY);
        assertThatThrownBy(() -> new ResendEmailSender(KEY, "not an address", "UniMarket", resend.baseUrl(), Duration.ofSeconds(1), json))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void theSenderNameCannotInjectHeaders() throws Exception {
        ResendEmailSender tricky = new ResendEmailSender(KEY, "no-reply@unimarket.test", "Uni\"Market\r\nBcc: x@y.z <", resend.baseUrl(), Duration.ofSeconds(1), json);
        tricky.send(message());
        assertThat(json.readTree(resend.last().body()).get("from").asText()).isEqualTo("UniMarketBcc: x@y.z <no-reply@unimarket.test>");
    }
}
