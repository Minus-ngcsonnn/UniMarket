package com.unimarket.service;

import com.unimarket.service.mail.EmailSender;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Sends the verification e-mail after the code has been committed to the database.
 * A delivery failure is logged (without the code); the student can request a new code.
 */
@Component
@Profile("!nodb")
public class VerificationEmailListener {

    private static final Logger log = LoggerFactory.getLogger(VerificationEmailListener.class);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm 'UTC', dd/MM/yyyy").withZone(ZoneOffset.UTC);

    private final EmailSender emailSender;

    /** @param emailSender configured delivery ({@code unimarket.mail.mode}) */
    public VerificationEmailListener(EmailSender emailSender) {
        this.emailSender = emailSender;
    }

    /** @param event the issued code */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCodeIssued(VerificationCodeIssuedEvent event) {
        String body = """
                Hi %s,

                Your UniMarket verification code is: %s

                It expires at %s. If you did not create a UniMarket account, ignore this e-mail.

                UniMarket - Buy smart. Sell easy. Stay campus-connected.
                """.formatted(event.fullName(), event.code(), TIME.format(event.expiresAt()));
        try {
            emailSender.send(event.email(), "Your UniMarket verification code", body);
        } catch (RuntimeException ex) {
            log.error("Could not send the verification e-mail to {}: {}", event.email(), ex.getMessage());
        }
    }
}
