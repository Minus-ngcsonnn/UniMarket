package com.unimarket.service.mail;

import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.io.UnsupportedEncodingException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sends e-mail through SMTP with Spring Boot Mail ({@code spring.mail.*}). Enabled by {@code unimarket.mail.mode=smtp}.
 * Approved provider: Gmail SMTP — {@code smtp.gmail.com:587}, SMTP AUTH, STARTTLS required — with the dedicated sender
 * account and a Google App Password.
 *
 * <ul>
 *   <li>Credentials come only from the environment / git-ignored {@code .env} ({@code MAIL_USERNAME},
 *       {@code MAIL_PASSWORD}); startup fails clearly when they are missing. They are never logged.</li>
 *   <li>Messages are multipart (plain text + HTML), UTF-8, from "UniMarket &lt;sender&gt;".</li>
 *   <li>A message counts as sent only when the SMTP server accepted it (250 after DATA). Every failure is thrown as
 *       {@link EmailDeliveryException} with a reason: wrong App Password (535), Gmail sending limits (4.7.x / 5.4.5),
 *       rejected recipient, service unavailable (421), timeout, network. SMTP acceptance is not proof of inbox
 *       delivery.</li>
 *   <li>At startup it logs in once (no e-mail sent) and logs only "succeeded" or the failure type.</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "unimarket.mail.mode", havingValue = "smtp")
public class SmtpEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailSender.class);
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s<>\"]+@[^@\\s<>\"]+\\.[^@\\s<>\"]+$");
    private static final Pattern SMTP_CODE = Pattern.compile("\\b([45]\\d\\d)[ -](\\d\\.\\d{1,3}\\.\\d{1,3})?");

    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final String fromName;
    private final String username;
    private final boolean verifyOnStartup;

    /**
     * @param mailSender      Spring's SMTP client ({@code spring.mail.host}, default smtp.gmail.com)
     * @param username        {@code MAIL_USERNAME} — the Gmail sender account (required)
     * @param password        {@code MAIL_PASSWORD} — a Google App Password (required, never logged)
     * @param from            {@code MAIL_FROM} (default: the username)
     * @param fromName        {@code MAIL_FROM_NAME} (default UniMarket)
     * @param verifyOnStartup {@code MAIL_VERIFY_ON_STARTUP}: log in once when the application is ready
     */
    public SmtpEmailSender(JavaMailSender mailSender,
                           @Value("${spring.mail.username:}") String username,
                           @Value("${spring.mail.password:}") String password,
                           @Value("${unimarket.mail.from:}") String from,
                           @Value("${unimarket.mail.from-name:UniMarket}") String fromName,
                           @Value("${unimarket.mail.verify-on-startup:true}") boolean verifyOnStartup) {
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new IllegalStateException("MAIL_MODE=smtp but MAIL_USERNAME and/or MAIL_PASSWORD are not set. Put the Gmail sender "
                    + "address and its Google App Password in the git-ignored UniMarket-Backend/.env (see .env.example), "
                    + "or use MAIL_MODE=log for local development.");
        }
        String address = from == null || from.isBlank() ? username.trim() : from.trim();
        if (!EMAIL.matcher(address).matches()) {
            throw new IllegalStateException("MAIL_FROM / MAIL_USERNAME is not an e-mail address.");
        }
        this.mailSender = mailSender;
        this.username = username.trim();
        this.fromAddress = address;
        this.fromName = fromName == null || fromName.isBlank() ? "UniMarket" : fromName.replaceAll("[\"<>\\r\\n]", "").trim();
        this.verifyOnStartup = verifyOnStartup;
        if (mailSender instanceof JavaMailSenderImpl impl) {
            // Envelope sender + Message-ID domain: without it JavaMail looks up this machine's host name for every
            // message (a slow reverse-DNS lookup on some machines).
            impl.getJavaMailProperties().putIfAbsent("mail.from", address);
        }
    }

    @Override
    public void send(String to, String subject, String body) {
        send(new EmailMessage(to, subject, body, null));
    }

    @Override
    public void send(EmailMessage message) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, message.html() != null, StandardCharsets.UTF_8.name());
            helper.setFrom(fromAddress, fromName);
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            if (message.html() != null) {
                helper.setText(message.text(), message.html());
            } else {
                helper.setText(message.text(), false);
            }
            mailSender.send(mime);
            log.info("SMTP server accepted the e-mail to {}", message.to());
        } catch (MailException | MessagingException | UnsupportedEncodingException ex) {
            EmailDeliveryException failure = classify(ex);
            log.warn("SMTP did not accept the e-mail to {}: {} (SMTP {})", message.to(), failure.reason(), failure.status());
            throw failure;
        }
    }

    /** Logs in once at startup (no e-mail is sent) so a wrong App Password shows up immediately in the log. */
    @EventListener(ApplicationReadyEvent.class)
    public void checkConnection() {
        if (!verifyOnStartup || !(mailSender instanceof JavaMailSenderImpl impl)) {
            return;
        }
        String target = impl.getHost() + ":" + impl.getPort();
        try {
            impl.testConnection();
            log.info("SMTP check: login to {} as {} succeeded (no e-mail sent).", target, masked(username));
        } catch (MessagingException ex) {
            EmailDeliveryException failure = classify(ex);
            log.error("SMTP check: login to {} as {} FAILED: {} (SMTP {}). Verification e-mails will not be delivered.",
                    target, masked(username), failure.reason(), failure.status());
        }
    }

    /** Maps JavaMail / Spring Mail failures to delivery reasons. Messages never include credentials. */
    static EmailDeliveryException classify(Exception ex) {
        int code = 0;
        String enhanced = "";
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof AuthenticationFailedException || cause instanceof MailAuthenticationException) {
                return failure(EmailDeliveryException.Reason.INVALID_CREDENTIALS, 535, ex);
            }
            if (cause instanceof SocketTimeoutException) {
                return failure(EmailDeliveryException.Reason.TIMEOUT, 0, ex);
            }
            if (code == 0 && cause.getMessage() != null) {
                Matcher m = SMTP_CODE.matcher(cause.getMessage());
                if (m.find()) {
                    code = Integer.parseInt(m.group(1));
                    enhanced = m.group(2) == null ? "" : m.group(2);
                }
            }
            if (cause instanceof MessagingException messaging && messaging.getNextException() != null && cause.getCause() == null) {
                Throwable next = messaging.getNextException();
                if (next instanceof SocketTimeoutException) {
                    return failure(EmailDeliveryException.Reason.TIMEOUT, 0, ex);
                }
                if (next instanceof ConnectException || next instanceof UnknownHostException) {
                    return failure(EmailDeliveryException.Reason.NETWORK, 0, ex);
                }
            }
            if (cause instanceof ConnectException || cause instanceof UnknownHostException) {
                return failure(EmailDeliveryException.Reason.NETWORK, 0, ex);
            }
        }
        if (code == 530 || code == 534 || code == 535) {
            return failure(EmailDeliveryException.Reason.INVALID_CREDENTIALS, code, ex);
        }
        if (enhanced.startsWith("4.7.") || enhanced.equals("5.4.5") || code == 452 || code == 454) {
            return failure(EmailDeliveryException.Reason.RATE_LIMITED, code, ex);
        }
        if (code == 550 || code == 553 || code == 501 || code == 555 || code == 551) {
            return failure(EmailDeliveryException.Reason.INVALID_REQUEST, code, ex);
        }
        return failure(EmailDeliveryException.Reason.PROVIDER_ERROR, code, ex);
    }

    private static EmailDeliveryException failure(EmailDeliveryException.Reason reason, int code, Exception ex) {
        return new EmailDeliveryException(reason, "SMTP delivery failed: " + reason + (code > 0 ? " (" + code + ")" : ""), ex, code);
    }

    private static String masked(String address) {
        int at = address.indexOf('@');
        return at <= 1 ? "***" + address.substring(Math.max(at, 0)) : address.charAt(0) + "***" + address.substring(at);
    }
}
