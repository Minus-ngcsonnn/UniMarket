package com.unimarket.service;

import com.unimarket.config.SecurityProperties;
import com.unimarket.service.mail.EmailDeliveryException;
import com.unimarket.service.mail.EmailMessage;
import com.unimarket.service.mail.EmailSender;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Sends the verification / password-reset e-mail for a code that is ALREADY COMMITTED to the database, and reports the real outcome.
 * Called outside any transaction, so a slow or failing provider never rolls back an account and never holds
 * database locks. A failure is returned (not swallowed) so the API can say the e-mail was not sent.
 * Codes are never logged here.
 */
@Component
@Profile("!nodb")
public class VerificationMailer {

    private static final Logger log = LoggerFactory.getLogger(VerificationMailer.class);

    /** What happened to the e-mail. Exposed to clients as {@code emailDelivery}. */
    public enum Delivery {
        /** The provider accepted the message. */
        SENT,
        /** Development only: written to the backend log, nothing was sent. */
        LOGGED,
        /** The provider refused it or did not answer; no e-mail went out. */
        FAILED
    }

    /** A freshly issued code (lives only in memory). */
    public record IssuedCode(int userId, String email, String fullName, String code, Instant expiresAt) {

        /** Keeps the code out of logs. */
        @Override
        public String toString() {
            return "IssuedCode[userId=" + userId + ", expiresAt=" + expiresAt + "]";
        }
    }

    private final EmailSender emailSender;
    private final SecurityProperties.Verification settings;

    public VerificationMailer(EmailSender emailSender, SecurityProperties properties) {
        this.emailSender = emailSender;
        this.settings = properties.verification();
    }

    /** Sends the email-verification code. @return the delivery outcome; never throws for provider problems */
    public Delivery deliver(IssuedCode issued) {
        return send(issued, "Verification", VerificationEmailTemplate.build(issued.email(), issued.fullName(), issued.code(),
                issued.expiresAt(), settings.codeTtl()));
    }

    /** Sends a password-reset code. @return the delivery outcome; never throws for provider problems */
    public Delivery deliverPasswordReset(IssuedCode issued) {
        return send(issued, "Password-reset", VerificationEmailTemplate.buildPasswordReset(issued.email(), issued.fullName(),
                issued.code(), issued.expiresAt(), settings.codeTtl()));
    }

    private Delivery send(IssuedCode issued, String kind, EmailMessage message) {
        try {
            emailSender.send(message);
            return emailSender.deliversRealEmail() ? Delivery.SENT : Delivery.LOGGED;
        } catch (EmailDeliveryException ex) {
            log.warn("{} e-mail for user {} not sent ({}, HTTP {})", kind, issued.userId(), ex.reason(), ex.status());
            return Delivery.FAILED;
        } catch (RuntimeException ex) {
            log.error("{} e-mail for user {} not sent: {}", kind, issued.userId(), ex.getClass().getSimpleName());
            return Delivery.FAILED;
        }
    }
}
