package com.unimarket;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Starts the whole application with the 'nodb' profile (no SQL Server needed) on a random
 * port and calls the real HTTP endpoints, including the security rules that need no account.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("nodb")
class NoDatabaseStartupTest {

    @Autowired
    private TestRestTemplate rest;

    @Test
    @SuppressWarnings("rawtypes")
    void apiHealthReportsDatabaseDisabled() {
        ResponseEntity<Map> response = rest.getForEntity("/api/health", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "UP").containsEntry("database", "DISABLED");
    }

    @Test
    @SuppressWarnings("rawtypes")
    void actuatorHealthIsUpWithoutDetails() {
        ResponseEntity<Map> response = rest.getForEntity("/actuator/health", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "UP").doesNotContainKey("components").doesNotContainKey("details");
    }

    @Test
    void otherActuatorEndpointsAreNotReachable() {
        // Not exposed, and protected by default since Stage 2: never 200.
        assertThat(rest.getForEntity("/actuator/env", String.class).getStatusCode()).isIn(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND);
        assertThat(rest.getForEntity("/actuator/beans", String.class).getStatusCode()).isIn(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND);
    }

    @Test
    @SuppressWarnings("rawtypes")
    void protectedUrlWithoutTokenIs401InTheSharedErrorFormat() {
        // Every non-public URL requires a token, so an anonymous request is refused before routing.
        ResponseEntity<Map> response = rest.getForEntity("/api/nothing-here", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).containsEntry("code", "AUTHENTICATION_REQUIRED").containsEntry("path", "/api/nothing-here");
        assertThat(response.getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE)).isEqualTo("Bearer");
    }

    @Test
    @SuppressWarnings("rawtypes")
    void malformedTokenIs401WithoutDetails() {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth("not.a.jwt");
        ResponseEntity<Map> response = rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).containsEntry("code", "AUTHENTICATION_REQUIRED");
        assertThat(response.getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE)).isEqualTo("Bearer error=\"invalid_token\"");
    }

    @Test
    @SuppressWarnings("rawtypes")
    void unknownUrlForSignedOutVisitorDoesNotLeakA404() {
        ResponseEntity<Map> response = rest.getForEntity("/api/admin/anything", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
