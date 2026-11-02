package com.unimarket;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Starts the whole application with the 'nodb' profile (no SQL Server needed) on a random
 * port and calls the real HTTP endpoints.
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
    void otherActuatorEndpointsAreNotExposed() {
        assertThat(rest.getForEntity("/actuator/env", String.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(rest.getForEntity("/actuator/beans", String.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @SuppressWarnings("rawtypes")
    void unknownApiUrlUsesTheSharedErrorFormat() {
        ResponseEntity<Map> response = rest.getForEntity("/api/nothing-here", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).containsEntry("code", "NOT_FOUND").containsEntry("path", "/api/nothing-here");
    }
}
