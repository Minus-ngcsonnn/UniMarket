package com.unimarket.security;

import com.unimarket.config.SecurityProperties;
import com.unimarket.entity.User;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Issues signed access tokens (JWT, HS256).
 *
 * <p>Claims: {@code iss}, {@code aud}, {@code sub} (user id), {@code iat}, {@code exp}, {@code jti}.
 * No email, name, role or other personal data is put in the token; the role is read from the
 * database on every request. Tokens are stateless: there is no server-side revocation, so a
 * token stays valid until it expires even after the user signs out in the browser.</p>
 */
@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final SecurityProperties.Jwt settings;
    private final Clock clock;

    /**
     * @param encoder    encoder configured with the HS256 key
     * @param properties security settings
     * @param clock      time source (UTC)
     */
    public JwtService(JwtEncoder encoder, SecurityProperties properties, Clock clock) {
        this.encoder = encoder;
        this.settings = properties.jwt();
        this.clock = clock;
    }

    /**
     * Issues an access token for a signed-in account.
     *
     * @param user the account (must be allowed to sign in)
     * @return the token and its expiry time
     */
    public AccessToken issueAccessToken(User user) {
        Instant now = clock.instant();
        Instant expiresAt = now.plus(settings.accessTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(settings.issuer())
                .audience(List.of(settings.audience()))
                .subject(String.valueOf(user.getId()))
                .issuedAt(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new AccessToken(token, expiresAt, settings.accessTokenTtl().toSeconds());
    }

    /**
     * @param value            the compact JWT
     * @param expiresAt        expiry time
     * @param expiresInSeconds lifetime in seconds
     */
    public record AccessToken(String value, Instant expiresAt, long expiresInSeconds) {
    }
}
