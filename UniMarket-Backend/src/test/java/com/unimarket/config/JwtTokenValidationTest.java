package com.unimarket.config;

import com.unimarket.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests of the JWT encoder/decoder configured in {@link SecurityConfig}: signature, expiry,
 * issuer, audience and algorithm checks. No Spring context and no database.
 */
class JwtTokenValidationTest {

    private static final String KEY = Base64.getEncoder().encodeToString("unit-test-only-key-0123456789-abcdefghijklmnop".getBytes(StandardCharsets.UTF_8));
    private final SecurityConfig config = new SecurityConfig();
    private final SecurityProperties properties = new SecurityProperties(
            new SecurityProperties.Jwt(KEY, "unimarket-api", "unimarket-web", Duration.ofHours(1), false), null, null, null);
    private final SecretKey key = config.jwtSigningKey(properties);
    private final JwtEncoder encoder = config.jwtEncoder(key);
    private final JwtDecoder decoder = config.jwtDecoder(key, properties);

    @Test
    void validTokenIsAcceptedAndContainsNoPersonalData() {
        Jwt jwt = decoder.decode(sign(encoder, claims(Instant.now(), Instant.now().plusSeconds(600)).build()));
        assertThat(jwt.getSubject()).isEqualTo("42");
        assertThat(jwt.getClaims().keySet()).containsExactlyInAnyOrder("iss", "aud", "sub", "iat", "exp", "jti");
    }

    @Test
    void expiredTokenIsRejected() {
        Instant past = Instant.now().minus(Duration.ofHours(2));
        String token = sign(encoder, claims(past, past.plus(Duration.ofHours(1))).build());
        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class).hasMessageContaining("expired");
    }

    @Test
    void tokenSignedWithAnotherKeyIsRejected() {
        SecretKey otherKey = config.jwtSigningKey(new SecurityProperties(new SecurityProperties.Jwt(
                Base64.getEncoder().encodeToString("another-key-that-is-long-enough-0123456789".getBytes(StandardCharsets.UTF_8)),
                "unimarket-api", "unimarket-web", Duration.ofHours(1), false), null, null, null));
        String forged = sign(config.jwtEncoder(otherKey), claims(Instant.now(), Instant.now().plusSeconds(600)).build());
        assertThatThrownBy(() -> decoder.decode(forged)).isInstanceOf(BadJwtException.class);
    }

    @Test
    void wrongIssuerOrAudienceIsRejected() {
        String wrongIssuer = sign(encoder, claims(Instant.now(), Instant.now().plusSeconds(600)).issuer("someone-else").build());
        String wrongAudience = sign(encoder, claims(Instant.now(), Instant.now().plusSeconds(600)).audience(List.of("other-app")).build());
        assertThatThrownBy(() -> decoder.decode(wrongIssuer)).isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(wrongAudience)).isInstanceOf(JwtException.class);
    }

    @Test
    void unsignedTokenIsRejected() {
        Base64.Encoder url = Base64.getUrlEncoder().withoutPadding();
        long exp = Instant.now().plusSeconds(600).getEpochSecond();
        String unsigned = url.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
                + url.encodeToString(("{\"sub\":\"1\",\"iss\":\"unimarket-api\",\"aud\":\"unimarket-web\",\"exp\":" + exp + "}")
                .getBytes(StandardCharsets.UTF_8)) + ".";
        assertThatThrownBy(() -> decoder.decode(unsigned)).isInstanceOf(JwtException.class);
    }

    @Test
    void tamperedPayloadIsRejected() {
        String token = sign(encoder, claims(Instant.now(), Instant.now().plusSeconds(600)).build());
        String[] parts = token.split("\\.");
        String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8).replace("\"42\"", "\"1\"");
        String tampered = parts[0] + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
        assertThatThrownBy(() -> decoder.decode(tampered)).isInstanceOf(BadJwtException.class);
    }

    @Test
    void jwtServiceIssuesTokensTheDecoderAccepts() {
        com.unimarket.security.PasswordStamp stamp = new com.unimarket.security.PasswordStamp(key);
        JwtService service = new JwtService(encoder, properties, java.time.Clock.systemUTC(), stamp);
        com.unimarket.entity.User user = com.unimarket.entity.User.newStudent("a@fpt.edu.vn", "x".repeat(60), "A", null, "Test University", null, java.time.LocalDateTime.now());
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", 7);
        JwtService.AccessToken token = service.issueAccessToken(user);
        Jwt jwt = decoder.decode(token.value());
        assertThat(jwt.getSubject()).isEqualTo("7");
        assertThat(jwt.getClaimAsString(com.unimarket.security.PasswordStamp.CLAIM)).isEqualTo(stamp.of(user)).hasSize(22);
        assertThat(jwt.getClaimAsString(com.unimarket.security.PasswordStamp.CLAIM)).doesNotContain("xxxx");
        assertThat(token.expiresInSeconds()).isEqualTo(3600);
        assertThat(Map.copyOf(jwt.getHeaders())).containsEntry("alg", "HS256");
    }

    @Test
    void shortOrMissingKeysAreRefusedOutsideDevelopment() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);
        assertThatThrownBy(() -> config.jwtSigningKey(new SecurityProperties(
                new SecurityProperties.Jwt(shortKey, "i", "a", Duration.ofHours(1), false), null, null, null)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("32 bytes");
        assertThatThrownBy(() -> config.jwtSigningKey(new SecurityProperties(
                new SecurityProperties.Jwt("", "i", "a", Duration.ofHours(1), false), null, null, null)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("JWT_SECRET is not set");
    }

    private static JwtClaimsSet.Builder claims(Instant issuedAt, Instant expiresAt) {
        return JwtClaimsSet.builder().issuer("unimarket-api").audience(List.of("unimarket-web")).subject("42")
                .issuedAt(issuedAt).expiresAt(expiresAt).id("test");
    }

    private static String sign(JwtEncoder encoder, JwtClaimsSet claims) {
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
