package com.unimarket.service.mail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Real e-mail delivery through the Resend REST API ({@code POST /emails}, https://resend.com/docs/api-reference).
 * Enabled by {@code unimarket.mail.mode=resend}.
 *
 * <ul>
 *   <li>Configuration comes only from the environment / git-ignored {@code .env}: {@code RESEND_API_KEY},
 *       {@code RESEND_FROM_EMAIL}, {@code RESEND_FROM_NAME}. Startup fails clearly when the key or sender is missing;
 *       there is no silent fallback to logging codes.</li>
 *   <li>The API key is sent only in the Authorization header and never logged or put in exception messages.</li>
 *   <li>A message counts as sent only when Resend answers 2xx with an id. Every other outcome throws
 *       {@link EmailDeliveryException} with a {@link EmailDeliveryException.Reason}.</li>
 *   <li>Resend only delivers to arbitrary recipients from a domain verified in the Resend dashboard. With the
 *       testing sender {@code onboarding@resend.dev} it can only send to the Resend account owner's address; other
 *       recipients are refused with 403 ({@code SENDER_NOT_ALLOWED}).</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "unimarket.mail.mode", havingValue = "resend")
public class ResendEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailSender.class);
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s<>\"]+@[^@\\s<>\"]+\\.[^@\\s<>\"]+$");
    private static final int MAX_LOGGED_MESSAGE = 200;

    private final HttpClient http;
    private final ObjectMapper json;
    private final URI endpoint;
    private final String apiKey;
    private final String from;
    private final Duration timeout;

    /**
     * @param apiKey    {@code RESEND_API_KEY} (required)
     * @param fromEmail {@code RESEND_FROM_EMAIL}: an address on a domain verified in Resend, or
     *                  {@code onboarding@resend.dev} for account-owner-only testing (required)
     * @param fromName  {@code RESEND_FROM_NAME} (default UniMarket)
     * @param apiUrl    API base URL (default https://api.resend.com; tests point it at a local mock)
     * @param timeout   connect + request timeout (default 10 s)
     */
    public ResendEmailSender(@Value("${unimarket.mail.resend.api-key:}") String apiKey,
                             @Value("${unimarket.mail.resend.from-email:}") String fromEmail,
                             @Value("${unimarket.mail.resend.from-name:UniMarket}") String fromName,
                             @Value("${unimarket.mail.resend.api-url:https://api.resend.com}") String apiUrl,
                             @Value("${unimarket.mail.resend.timeout:PT10S}") Duration timeout,
                             ObjectMapper json) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("MAIL_MODE=resend but RESEND_API_KEY is not set. "
                    + "Put it in the environment or in the git-ignored UniMarket-Backend/.env (see .env.example).");
        }
        if (fromEmail == null || !EMAIL.matcher(fromEmail.trim()).matches()) {
            throw new IllegalStateException("MAIL_MODE=resend but RESEND_FROM_EMAIL is missing or not an e-mail address. "
                    + "Use an address on a domain verified in the Resend dashboard (or onboarding@resend.dev for "
                    + "testing, which only delivers to the Resend account owner's address).");
        }
        String name = fromName == null || fromName.isBlank() ? "UniMarket" : fromName.replaceAll("[\"<>\\r\\n]", "").trim();
        this.apiKey = apiKey.trim();
        this.from = name + " <" + fromEmail.trim() + ">";
        this.endpoint = URI.create(apiUrl.replaceAll("/+$", "") + "/emails");
        this.timeout = timeout;
        this.json = json;
        this.http = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(HttpClient.Redirect.NEVER).build();
        log.info("E-mail delivery: Resend API, sender {} (API key configured, not shown).", this.from);
    }

    @Override
    public void send(String to, String subject, String body) {
        send(new EmailMessage(to, subject, body, null));
    }

    @Override
    public void send(EmailMessage message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("from", from);
        payload.put("to", List.of(message.to()));
        payload.put("subject", message.subject());
        if (message.html() != null) {
            payload.put("html", message.html());
        }
        payload.put("text", message.text());
        HttpResponse<String> response;
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(timeout)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .header("Accept", "application/json")
                    .header("User-Agent", "UniMarket-Backend")
                    // Same key for retries of this exact call; prevents duplicates if a retry layer is added later.
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (HttpTimeoutException ex) {
            throw new EmailDeliveryException(EmailDeliveryException.Reason.TIMEOUT, "Resend did not answer in time", ex);
        } catch (IOException ex) {
            throw new EmailDeliveryException(EmailDeliveryException.Reason.NETWORK, "Could not reach Resend: " + ex.getClass().getSimpleName(), ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new EmailDeliveryException(EmailDeliveryException.Reason.NETWORK, "Interrupted while sending", ex);
        }

        int status = response.statusCode();
        JsonNode body = parse(response.body());
        if (status >= 200 && status < 300 && body.hasNonNull("id")) {
            log.info("Resend accepted the e-mail to {} (id {})", message.to(), body.get("id").asText());
            return;
        }
        String name = body.path("name").asText("");
        String providerMessage = truncate(body.path("message").asText(""));
        EmailDeliveryException.Reason reason = classify(status, name);
        log.warn("Resend refused the e-mail to {}: HTTP {} {} - {}", message.to(), status, name, providerMessage);
        throw new EmailDeliveryException(reason, status, "Resend refused the e-mail: HTTP " + status + (name.isEmpty() ? "" : " " + name));
    }

    static EmailDeliveryException.Reason classify(int status, String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (n.contains("api_key") || status == 401) {
            return EmailDeliveryException.Reason.INVALID_CREDENTIALS;
        }
        if (status == 403) {
            return EmailDeliveryException.Reason.SENDER_NOT_ALLOWED;
        }
        if (status == 429 || n.contains("rate_limit") || n.contains("quota")) {
            return EmailDeliveryException.Reason.RATE_LIMITED;
        }
        if (status == 400 || status == 422 || n.contains("validation")) {
            return EmailDeliveryException.Reason.INVALID_REQUEST;
        }
        return EmailDeliveryException.Reason.PROVIDER_ERROR;
    }

    private JsonNode parse(String body) {
        try {
            return body == null || body.isBlank() ? json.createObjectNode() : json.readTree(body);
        } catch (IOException ex) {
            return json.createObjectNode();
        }
    }

    private String truncate(String text) {
        String clean = text.replace(apiKey, "[key]").replaceAll("[\\r\\n]+", " ");
        return clean.length() <= MAX_LOGGED_MESSAGE ? clean : clean.substring(0, MAX_LOGGED_MESSAGE) + "…";
    }
}
