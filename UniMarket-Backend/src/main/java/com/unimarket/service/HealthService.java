package com.unimarket.service;

import com.unimarket.dto.HealthResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Provides the application's health information.
 *
 * <p>This is a lightweight liveness check: it reports that the API process is
 * running and does not depend on the database, so it can be used to test
 * frontend-backend connectivity even when SQL Server is unavailable.</p>
 */
@Service
public class HealthService {

    private static final String STATUS_UP = "UP";

    private final String applicationName;

    /**
     * Creates the service.
     *
     * @param applicationName value of {@code spring.application.name}
     */
    public HealthService(@Value("${spring.application.name}") String applicationName) {
        this.applicationName = applicationName;
    }

    /**
     * Returns the current health status of the application.
     *
     * @return a {@link HealthResponse} with status {@code UP} and the application name
     */
    public HealthResponse getHealth() {
        return new HealthResponse(STATUS_UP, applicationName);
    }
}
