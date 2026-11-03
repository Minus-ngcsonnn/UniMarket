package com.unimarket.service;

import com.unimarket.service.mail.EmailMessage;
import org.springframework.web.util.HtmlUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * The verification e-mail (Vietnamese first): a simple, responsive HTML version with inline styles (works in Gmail,
 * Outlook and mobile clients) and a plain-text version. The only user-controlled value, the full name, is
 * HTML-escaped and stripped of line breaks. The code is never logged by this class.
 */
public final class VerificationEmailTemplate {

    static final String SUBJECT = "Mã xác thực UniMarket của bạn";
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm 'ngày' dd/MM/yyyy").withZone(VIETNAM);

    private VerificationEmailTemplate() {
    }

    /**
     * @param to        recipient
     * @param fullName  account name (user input)
     * @param code      6-digit code
     * @param expiresAt code expiry
     * @param validity  code lifetime (10 minutes)
     */
    public static EmailMessage build(String to, String fullName, String code, Instant expiresAt, Duration validity) {
        String name = fullName == null ? "" : fullName.replaceAll("[\\r\\n\\t]+", " ").strip();
        long minutes = Math.max(1, validity.toMinutes());
        String until = TIME.format(expiresAt);

        String text = """
                Chào %s,

                Chào mừng bạn đến với UniMarket - chợ đồ cũ của sinh viên.

                Mã xác thực email của bạn là: %s

                Mã có hiệu lực trong %d phút (đến %s, giờ Việt Nam) và chỉ dùng được một lần.
                Không chia sẻ mã này với bất kỳ ai. UniMarket không bao giờ hỏi mã của bạn qua điện thoại hay tin nhắn.

                Nếu bạn không đăng ký tài khoản UniMarket, hãy bỏ qua email này.

                UniMarket - Mua thông minh. Bán dễ dàng.
                ---
                Your UniMarket verification code is %s (valid for %d minutes). If you did not sign up, ignore this e-mail.
                """.formatted(name.isEmpty() ? "bạn" : name, code, minutes, until, code, minutes);

        String safeName = HtmlUtils.htmlEscape(name.isEmpty() ? "bạn" : name, "UTF-8");
        String html = """
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="color-scheme" content="light">
                <title>%s</title>
                </head>
                <body style="margin:0;padding:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
                <div style="display:none;max-height:0;overflow:hidden;">Mã xác thực UniMarket: %s. Hiệu lực %d phút.</div>
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:24px 12px;">
                <tr><td align="center">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e8e1d6;">
                <tr><td style="padding:28px 28px 8px 28px;">
                <p style="margin:0;font-size:20px;font-weight:bold;color:#c2410c;">UniMarket</p>
                <p style="margin:4px 0 0 0;font-size:13px;color:#6b7280;">Chợ đồ cũ của sinh viên</p>
                </td></tr>
                <tr><td style="padding:16px 28px 0 28px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1f2933;">Chào mừng %s đến với UniMarket!</h1>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;">Nhập mã dưới đây trên trang xác thực để kích hoạt tài khoản của bạn.</p>
                </td></tr>
                <tr><td align="center" style="padding:0 28px;">
                <div style="display:inline-block;padding:16px 24px;border-radius:12px;background:#fff7ed;border:1px solid #fdba74;font-size:32px;font-weight:bold;letter-spacing:6px;color:#9a3412;font-family:'Courier New',Courier,monospace;">%s</div>
                </td></tr>
                <tr><td style="padding:20px 28px 0 28px;font-size:14px;line-height:1.6;">
                <p style="margin:0 0 8px 0;">Mã có hiệu lực trong <strong>%d phút</strong> (đến %s, giờ Việt Nam) và chỉ dùng được một lần.</p>
                <p style="margin:0 0 8px 0;"><strong>Không chia sẻ mã này với bất kỳ ai.</strong> UniMarket không bao giờ hỏi mã của bạn qua điện thoại hay tin nhắn.</p>
                <p style="margin:0;color:#6b7280;">Nếu bạn không đăng ký tài khoản UniMarket, hãy bỏ qua email này. Tài khoản sẽ không được kích hoạt nếu không có mã.</p>
                </td></tr>
                <tr><td style="padding:24px 28px 28px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #f1ece4;">
                <p style="margin:16px 0 0 0;">Your UniMarket verification code is %s (valid for %d minutes). If you did not sign up, you can ignore this e-mail.</p>
                <p style="margin:8px 0 0 0;">UniMarket · Mua thông minh. Bán dễ dàng.</p>
                </td></tr>
                </table>
                </td></tr>
                </table>
                </body>
                </html>
                """.formatted(SUBJECT, code, minutes, safeName, code, minutes, until, code, minutes);

        return new EmailMessage(to, SUBJECT, text, html);
    }
}
