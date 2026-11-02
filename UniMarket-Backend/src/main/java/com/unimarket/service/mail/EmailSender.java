package com.unimarket.service.mail;

/**
 * Sends e-mail. The implementation is chosen by {@code unimarket.mail.mode}:
 * {@code smtp} ({@link SmtpEmailSender}) or {@code log} ({@link LoggingEmailSender}, development only).
 */
public interface EmailSender {

    /**
     * @param to      recipient address
     * @param subject subject line
     * @param body    plain-text body
     */
    void send(String to, String subject, String body);
}
