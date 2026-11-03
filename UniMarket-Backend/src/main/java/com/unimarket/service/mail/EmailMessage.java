package com.unimarket.service.mail;

/**
 * One e-mail. {@code html} is optional (plain-text only messages); {@code text} is always present.
 * Never log a whole message: verification e-mails contain one-time codes.
 *
 * @param to      recipient address
 * @param subject subject line (UTF-8)
 * @param text    plain-text body
 * @param html    HTML body, or null
 */
public record EmailMessage(String to, String subject, String text, String html) {

    /** Keeps the bodies (and any code they contain) out of logs. */
    @Override
    public String toString() {
        return "EmailMessage[to=" + to + ", subject=" + subject + "]";
    }
}
