package com.unimarket.service.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends e-mail through SMTP ({@code spring.mail.*}, configured only through environment variables).
 * Enabled by {@code unimarket.mail.mode=smtp}.
 */
@Component
@ConditionalOnProperty(name = "unimarket.mail.mode", havingValue = "smtp")
public class SmtpEmailSender implements EmailSender {

    private final JavaMailSender mailSender;
    private final String from;

    /**
     * @param mailSender Spring's SMTP client (requires {@code MAIL_HOST})
     * @param from       sender address ({@code MAIL_FROM})
     */
    public SmtpEmailSender(JavaMailSender mailSender, @Value("${unimarket.mail.from}") String from) {
        this.mailSender = mailSender;
        this.from = from;
    }

    @Override
    public void send(String to, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(body);
        mailSender.send(message);
    }
}
