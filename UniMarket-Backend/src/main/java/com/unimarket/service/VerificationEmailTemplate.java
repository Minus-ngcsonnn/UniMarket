package com.unimarket.service;

import com.unimarket.service.mail.EmailMessage;
import org.springframework.web.util.HtmlUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * UniMarket one-time-code e-mails (Vietnamese first): email verification and password reset. Each has a responsive
 * HTML version with inline styles (Gmail, Outlook and mobile clients) and a plain-text version.
 *
 * <p>Visual style follows the website (index.css): primary blue {@code #2459E0}, soft blue {@code #EDF3FF}, ink
 * {@code #18243B}, muted text {@code #5D6879}, warm off-white page {@code #F7F6F2}. All text/background pairs meet
 * WCAG AA contrast. The only user-controlled value, the full name, is HTML-escaped and stripped of line breaks.
 * The code is never logged by this class.</p>
 */
public final class VerificationEmailTemplate {

    static final String SUBJECT = "Mã xác thực UniMarket của bạn";
    static final String RESET_SUBJECT = "Mã đặt lại mật khẩu UniMarket";
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm 'ngày' dd/MM/yyyy").withZone(VIETNAM);

    private VerificationEmailTemplate() {
    }

    /**
     * The e-mail sent after registration (and on "resend code").
     *
     * @param to        recipient
     * @param fullName  account name (user input)
     * @param code      6-digit code
     * @param expiresAt code expiry
     * @param validity  code lifetime (10 minutes)
     */
    public static EmailMessage build(String to, String fullName, String code, Instant expiresAt, Duration validity) {
        String name = displayName(fullName);
        long minutes = minutes(validity);
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
                """.formatted(name, code, minutes, until, code, minutes);

        String html = layout(SUBJECT,
                "Mã xác thực UniMarket: %s. Hiệu lực %d phút.".formatted(code, minutes),
                "Xác thực email",
                "Chào mừng %s đến với UniMarket!".formatted(escape(name)),
                "Nhập mã dưới đây trên trang xác thực để kích hoạt tài khoản. Sau khi xác thực, bạn sẽ được đăng nhập ngay.",
                code, minutes, until,
                "Nếu bạn không đăng ký tài khoản UniMarket, hãy bỏ qua email này. Tài khoản sẽ không được kích hoạt nếu không có mã.",
                "Your UniMarket verification code is %s (valid for %d minutes). If you did not sign up, you can ignore this e-mail."
                        .formatted(code, minutes));
        return new EmailMessage(to, SUBJECT, text, html);
    }

    /**
     * The e-mail sent by "Forgot password".
     *
     * @param to        recipient
     * @param fullName  account name (user input)
     * @param code      6-digit reset code
     * @param expiresAt code expiry
     * @param validity  code lifetime (10 minutes)
     */
    public static EmailMessage buildPasswordReset(String to, String fullName, String code, Instant expiresAt, Duration validity) {
        String name = displayName(fullName);
        long minutes = minutes(validity);
        String until = TIME.format(expiresAt);

        String text = """
                Chào %s,

                Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản UniMarket dùng email này.

                Mã đặt lại mật khẩu của bạn là: %s

                Mã có hiệu lực trong %d phút (đến %s, giờ Việt Nam) và chỉ dùng được một lần.
                Không chia sẻ mã này với bất kỳ ai. UniMarket không bao giờ hỏi mã của bạn qua điện thoại hay tin nhắn.

                Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn vẫn giữ nguyên.

                UniMarket - Mua thông minh. Bán dễ dàng.
                ---
                Your UniMarket password reset code is %s (valid for %d minutes). If you did not ask for it, ignore this e-mail.
                """.formatted(name, code, minutes, until, code, minutes);

        String html = layout(RESET_SUBJECT,
                "Mã đặt lại mật khẩu UniMarket: %s. Hiệu lực %d phút.".formatted(code, minutes),
                "Đặt lại mật khẩu",
                "Chào %s,".formatted(escape(name)),
                "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản UniMarket của bạn. Nhập mã dưới đây cùng mật khẩu mới trên trang đặt lại mật khẩu.",
                code, minutes, until,
                "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn vẫn giữ nguyên.",
                "Your UniMarket password reset code is %s (valid for %d minutes). If you did not ask for it, you can ignore this e-mail."
                        .formatted(code, minutes));
        return new EmailMessage(to, RESET_SUBJECT, text, html);
    }

    /** Shared HTML layout: blue header band, white card, soft-blue code box. Arguments must already be safe HTML. */
    private static String layout(String title, String preheader, String label, String heading, String intro, String code,
                                 long minutes, String until, String ignoreNotice, String english) {
        return """
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="color-scheme" content="light">
                <meta name="supported-color-schemes" content="light">
                <title>%s</title>
                </head>
                <body style="margin:0;padding:0;background:#f7f6f2;font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;color:#18243b;">
                <div style="display:none;max-height:0;overflow:hidden;">%s</div>
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f7f6f2;padding:24px 12px;">
                <tr><td align="center">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e7e5e0;overflow:hidden;">
                <tr><td style="background:#2459e0;padding:22px 28px;">
                <p style="margin:0;font-size:22px;font-weight:bold;letter-spacing:-0.3px;color:#ffffff;">UniMarket</p>
                <p style="margin:4px 0 0 0;font-size:13px;color:#ffffff;">Chợ đồ cũ của sinh viên</p>
                </td></tr>
                <tr><td style="padding:28px 28px 0 28px;">
                <p style="margin:0 0 8px 0;font-size:12px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#2459e0;">%s</p>
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#18243b;">%s</h1>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#18243b;">%s</p>
                </td></tr>
                <tr><td align="center" style="padding:0 28px;">
                <div style="display:inline-block;padding:16px 28px;border-radius:12px;background:#edf3ff;border:1px solid #c5d5fa;font-size:32px;font-weight:bold;letter-spacing:8px;color:#1d47b8;font-family:'Courier New',Courier,monospace;" aria-label="Mã gồm 6 chữ số">%s</div>
                </td></tr>
                <tr><td style="padding:20px 28px 0 28px;font-size:14px;line-height:1.6;color:#18243b;">
                <p style="margin:0 0 8px 0;">Mã có hiệu lực trong <strong>%d phút</strong> (đến %s, giờ Việt Nam) và chỉ dùng được một lần.</p>
                <p style="margin:0 0 8px 0;"><strong>Không chia sẻ mã này với bất kỳ ai.</strong> UniMarket không bao giờ hỏi mã của bạn qua điện thoại hay tin nhắn.</p>
                <p style="margin:0;color:#5d6879;">%s</p>
                </td></tr>
                <tr><td style="padding:24px 28px 28px 28px;">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e7e5e0;">
                <tr><td style="padding-top:16px;font-size:12px;line-height:1.5;color:#5d6879;">
                <p style="margin:0;">%s</p>
                <p style="margin:8px 0 0 0;"><strong style="color:#2459e0;">UniMarket</strong> · Mua thông minh. Bán dễ dàng.</p>
                </td></tr>
                </table>
                </td></tr>
                </table>
                </td></tr>
                </table>
                </body>
                </html>
                """.formatted(title, preheader, label, heading, intro, code, minutes, until, ignoreNotice, english);
    }

    private static String displayName(String fullName) {
        String name = fullName == null ? "" : fullName.replaceAll("[\\r\\n\\t]+", " ").strip();
        return name.isEmpty() ? "bạn" : name;
    }

    private static long minutes(Duration validity) {
        return Math.max(1, validity.toMinutes());
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value, "UTF-8");
    }
}
