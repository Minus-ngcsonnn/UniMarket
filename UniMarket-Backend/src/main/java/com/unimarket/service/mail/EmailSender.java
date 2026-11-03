package com.unimarket.service.mail;

/**
 * Sends e-mail. The implementation is chosen by {@code unimarket.mail.mode}:
 * {@code smtp} ({@link SmtpEmailSender}, real delivery; approved provider: Gmail SMTP) or
 * {@code log} ({@link LoggingEmailSender}, development only).
 *
 * <p>Implementations throw {@link EmailDeliveryException} (or another runtime exception) when the message was not
 * accepted; callers must not report a message as sent in that case.</p>
 */
public interface EmailSender {

    /**
     * @param to      recipient address
     * @param subject subject line
     * @param body    plain-text body
     */
    void send(String to, String subject, String body);

    /** Sends a message with an optional HTML part. Default: the plain-text part only. */
    default void send(EmailMessage message) {
        send(message.to(), message.subject(), message.text());
    }

    /** @return false when nothing is really delivered (the development log sender) */
    default boolean deliversRealEmail() {
        return true;
    }
}
