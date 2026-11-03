package com.unimarket.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.unimarket.repository.UserRepository;
import com.unimarket.security.DatabaseUserJwtConverter;
import com.unimarket.security.JsonSecurityErrorHandler;
import com.unimarket.security.SecretKeys;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.time.Clock;
import java.util.List;

/**
 * Spring Security configuration: stateless bearer-token (JWT) authentication.
 *
 * <ul>
 *   <li>Public: health checks, registration, email verification, resending a code, login, and
 *       read-only marketplace browsing ({@code GET /api/products/**}, {@code GET /api/categories/**})
 *       for the stages that add them.</li>
 *   <li>{@code /api/admin/**}: accounts with {@code Users.Role = 'Admin'} only (403 for students).</li>
 *   <li>Everything else: any signed-in, active, verified account (401 otherwise).</li>
 * </ul>
 *
 * <p>CSRF protection is disabled on purpose: the API uses no cookies or sessions; the token travels in
 * the {@code Authorization} header, which a cross-site form cannot set. If tokens are ever moved into
 * cookies, CSRF protection must be turned back on.</p>
 */
@Configuration
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityConfig {

    /** Endpoints that never need a token. */
    private static final String[] PUBLIC_POST = {
            "/api/auth/register", "/api/auth/login", "/api/auth/verify-email", "/api/auth/resend-verification",
            // Stage 4: simulated provider -> server notification. No user token (like a real provider), but every
            // request must carry a valid HMAC signature; the endpoint only exists while the sandbox simulator is enabled.
            "/api/dev/payment-simulator/callback"};
    private static final String[] PUBLIC_GET = {
            "/api/health", "/actuator/health", "/api/products/**", "/api/categories/**",
            // Stage 3: read-only reference data and uploaded listing photos (public, like listing pages)
            "/api/universities/**", "/api/campuses/**", "/media/products/**",
            // Stage 5: public profiles, ratings and reviews of active students; promotion packages (prices are public)
            "/api/users/**", "/api/promotion-packages",
            // V003: demo pickup / delivery areas (names only, no coordinates)
            "/api/locations/zones"};

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, DatabaseUserJwtConverter jwtConverter,
                                    JsonSecurityErrorHandler errorHandler) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> { })
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST, PUBLIC_POST).permitAll()
                        .requestMatchers(HttpMethod.GET, PUBLIC_GET).permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter))
                        .authenticationEntryPoint(errorHandler)
                        .accessDeniedHandler(errorHandler))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(errorHandler)
                        .accessDeniedHandler(errorHandler));
        return http.build();
    }

    @Bean
    DatabaseUserJwtConverter databaseUserJwtConverter(ObjectProvider<UserRepository> users) {
        return new DatabaseUserJwtConverter(users);
    }

    @Bean
    JsonSecurityErrorHandler jsonSecurityErrorHandler(ObjectMapper objectMapper) {
        return new JsonSecurityErrorHandler(objectMapper);
    }

    /** HS256 key shared by the encoder and the decoder; loaded once. */
    @Bean
    SecretKey jwtSigningKey(SecurityProperties properties) {
        SecurityProperties.Jwt jwt = properties.jwt();
        byte[] key = SecretKeys.load(jwt.secret(), "JWT_SECRET", jwt.allowEphemeralSecret());
        return new SecretKeySpec(key, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSigningKey));
    }

    /** Validates signature (HS256 only), expiry / not-before, issuer and audience. */
    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtSigningKey, SecurityProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSigningKey).macAlgorithm(MacAlgorithm.HS256).build();
        String audience = properties.jwt().audience();
        OAuth2TokenValidator<Jwt> audienceValidator = token -> token.getAudience() != null && token.getAudience().contains(audience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong audience.", null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.jwt().issuer()), audienceValidator));
        return decoder;
    }

    /** BCrypt, compatible with the existing {@code $2a$10$} hashes in {@code dbo.Users}. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    /** Only the configured browser origins; no wildcard, no cookies (credentials) needed. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(SecurityProperties properties) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(properties.cors().allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /** UTC clock, replaceable in tests. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
