package com.unimarket.mail;

import com.unimarket.service.mail.EmailDeliveryException;
import com.unimarket.service.mail.EmailDeliveryException.Reason;
import com.unimarket.service.mail.EmailMessage;
import com.unimarket.service.mail.SmtpEmailSender;
import com.unimarket.support.MockSmtpServer;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** Gmail-style SMTP delivery against a LOCAL mock SMTP server (no real account, no real e-mail). */
class SmtpEmailSenderTest {

    private static final String USER = "unimarket.test.sender@gmail.com";
    private static final String APP_PASSWORD = "abcd efgh ijkl mnop";
    private MockSmtpServer smtp;

    @BeforeEach
    void start() {
        smtp = new MockSmtpServer(USER, APP_PASSWORD);
    }

    @AfterEach
    void stop() {
        smtp.close();
    }

    private JavaMailSenderImpl client(int port, String password) {
        JavaMailSenderImpl mail = new JavaMailSenderImpl();
        mail.setHost("127.0.0.1");
        mail.setPort(port);
        mail.setUsername(USER);
        mail.setPassword(password);
        mail.setDefaultEncoding("UTF-8");
        Properties p = mail.getJavaMailProperties();
        p.put("mail.smtp.auth", "true");
        p.put("mail.smtp.starttls.enable", "false");   // the mock has no TLS; production requires STARTTLS
        p.put("mail.smtp.connectiontimeout", "800");
        p.put("mail.smtp.timeout", "800");
        p.put("mail.smtp.writetimeout", "800");
        p.put("mail.smtp.localhost", "localhost");   // same as production config: no reverse-DNS lookup
        return mail;
    }

    private SmtpEmailSender sender(String password) {
        return new SmtpEmailSender(client(smtp.port(), password), USER, password, "", "UniMarket", false);
    }

    private static EmailMessage message() {
        return new EmailMessage("student@gmail.com", "Mã xác thực UniMarket của bạn", "Mã xác thực email của bạn là: 123456",
                "<p>Chào mừng – <b>123456</b> – Cần Thơ</p>");
    }

    @Test
    void anAcceptedMessageIsMultipartUtf8FromUniMarket() throws Exception {
        sender(APP_PASSWORD).send(message());
        MockSmtpServer.Received received = smtp.last();
        assertThat(received.authUser()).isEqualTo(USER);
        assertThat(received.rcptTo()).containsExactly("<student@gmail.com>");
        MimeMessage mime = received.mime();
        assertThat(mime.getSubject()).isEqualTo("Mã xác thực UniMarket của bạn");
        InternetAddress from = (InternetAddress) mime.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo(USER);
        assertThat(from.getPersonal()).isEqualTo("UniMarket");
        assertThat(textOf(mime, "text/plain")).contains("123456");
        assertThat(textOf(mime, "text/html")).contains("Cần Thơ");
        assertThat(received.raw()).doesNotContain(APP_PASSWORD);
    }

    @Test
    void aWrongAppPasswordIsAnAuthenticationFailure() {
        EmailDeliveryException ex = catchThrowableOfType(EmailDeliveryException.class, () -> sender("wrong-password").send(message()));
        assertThat(ex.reason()).isEqualTo(Reason.INVALID_CREDENTIALS);
        assertThat(ex.getMessage()).doesNotContain("wrong-password").doesNotContain(APP_PASSWORD);
        assertThat(smtp.received()).isEmpty();
    }

    @Test
    void refusalsAreClassifiedAndNeverReportedAsSent() {
        smtp.rejectRecipient();
        assertThat(catchThrowableOfType(EmailDeliveryException.class, () -> sender(APP_PASSWORD).send(message())).reason())
                .isEqualTo(Reason.INVALID_REQUEST);
        smtp.sendingLimit();
        assertThat(catchThrowableOfType(EmailDeliveryException.class, () -> sender(APP_PASSWORD).send(message())).reason())
                .isEqualTo(Reason.RATE_LIMITED);
        smtp.unavailable();
        assertThat(catchThrowableOfType(EmailDeliveryException.class, () -> sender(APP_PASSWORD).send(message())).reason())
                .isEqualTo(Reason.PROVIDER_ERROR);
        assertThat(smtp.received()).isEmpty();
    }

    @Test
    void aSlowServerTimesOut() {
        smtp.slow(2_000);
        assertThat(catchThrowableOfType(EmailDeliveryException.class, () -> sender(APP_PASSWORD).send(message())).reason())
                .isEqualTo(Reason.TIMEOUT);
    }

    @Test
    void anUnreachableServerIsANetworkFailure() {
        int port = smtp.port();
        smtp.close();
        SmtpEmailSender offline = new SmtpEmailSender(client(port, APP_PASSWORD), USER, APP_PASSWORD, "", "UniMarket", false);
        assertThat(catchThrowableOfType(EmailDeliveryException.class, () -> offline.send(message())).reason())
                .isIn(Reason.NETWORK, Reason.TIMEOUT);
        smtp = new MockSmtpServer(USER, APP_PASSWORD);
    }

    @Test
    void missingCredentialsStopTheStartupWithoutFallingBackToLogging() {
        assertThatThrownBy(() -> new SmtpEmailSender(client(smtp.port(), ""), "", APP_PASSWORD, "", "UniMarket", false))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("MAIL_USERNAME");
        assertThatThrownBy(() -> new SmtpEmailSender(client(smtp.port(), ""), USER, " ", "", "UniMarket", false))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("MAIL_PASSWORD").hasMessageNotContaining(USER);
        assertThatThrownBy(() -> new SmtpEmailSender(client(smtp.port(), APP_PASSWORD), USER, APP_PASSWORD, "not-an-address", "UniMarket", false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void theStartupCheckLogsInWithoutSendingMail() {
        SmtpEmailSender checking = new SmtpEmailSender(client(smtp.port(), APP_PASSWORD), USER, APP_PASSWORD, "", "UniMarket", true);
        checking.checkConnection();
        assertThat(smtp.connections()).isEqualTo(1);
        assertThat(smtp.received()).isEmpty();
    }

    private static String textOf(Part part, String type) throws Exception {
        if (part.isMimeType(type)) {
            return (String) part.getContent();
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                String found = textOf(multipart.getBodyPart(i), type);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}
