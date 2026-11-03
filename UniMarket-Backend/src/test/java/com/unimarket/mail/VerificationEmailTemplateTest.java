package com.unimarket.mail;

import com.unimarket.service.VerificationEmailTemplate;
import com.unimarket.service.mail.EmailMessage;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** The Vietnamese verification e-mail (HTML + text). */
class VerificationEmailTemplateTest {

    private static final Instant EXPIRES = Instant.parse("2026-11-03T03:10:00Z");   // 10:10 in Vietnam

    @Test
    void containsTheCodeValidityWarningAndIgnoreNoticeInVietnamese() {
        EmailMessage m = VerificationEmailTemplate.build("an@gmail.com", "Nguyễn Văn An", "482913", EXPIRES, Duration.ofMinutes(10));
        assertThat(m.subject()).isEqualTo("Mã xác thực UniMarket của bạn");
        assertThat(m.text()).contains("Mã xác thực email của bạn là: 482913").contains("10 phút").contains("10:10 ngày 03/11/2026")
                .contains("Không chia sẻ mã").contains("bỏ qua email này");
        assertThat(m.html()).startsWith("<!DOCTYPE html>").contains("<meta charset=\"UTF-8\">").contains("482913")
                .contains("Chào mừng Nguyễn Văn An").contains("10 phút").contains("Không chia sẻ mã").contains("viewport");
    }

    @Test
    void theNameIsEscapedInHtmlAndStrippedOfLineBreaks() {
        EmailMessage m = VerificationEmailTemplate.build("x@gmail.com", "<script>alert(1)</script>\r\nBcc: evil", "111111", EXPIRES, Duration.ofMinutes(10));
        assertThat(m.html()).doesNotContain("<script>").contains("&lt;script&gt;alert(1)&lt;/script&gt;");
        assertThat(m.text()).doesNotContain("\r\nBcc").contains("<script>alert(1)</script> Bcc: evil");
    }

    @Test
    void neverPrintsTheCodeInToString() {
        EmailMessage m = VerificationEmailTemplate.build("x@gmail.com", "A", "654321", EXPIRES, Duration.ofMinutes(10));
        assertThat(m.toString()).doesNotContain("654321");
    }
}
