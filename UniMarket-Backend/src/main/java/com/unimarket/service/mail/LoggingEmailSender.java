package com.unimarket.service.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * LOCAL DEVELOPMENT ONLY: does not send anything, it writes the plain-text message (including the
 * verification code) to the application log so a developer can complete registration without a mail provider.
 * Enabled by {@code unimarket.mail.mode=log}, which only the 'dev' profile sets by default. Never used when
 * {@code MAIL_MODE=resend} or {@code smtp}.
 */
@Component
@ConditionalOnProperty(name = "unimarket.mail.mode", havingValue = "log")
public class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

    /** Warns once at startup that e-mails are not really sent. */
    public LoggingEmailSender() {
        log.warn("unimarket.mail.mode=log: e-mails are NOT sent; they are written to this log (development only).");
    }

    @Override
    public void send(String to, String subject, String body) {
        log.info("[DEV E-MAIL, not sent] to={} subject=\"{}\"\n{}", to, subject, body);
    }

    @Override
    public boolean deliversRealEmail() {
        return false;
    }
}
