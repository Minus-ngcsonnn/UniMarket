package com.unimarket.service;

import com.unimarket.dto.HealthResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * Provides the application's health information.
 *
 * <p>The API reports {@code UP} as long as it is running, so the frontend can tell whether
 * the backend is reachable. Database connectivity is checked separately with a short,
 * read-only {@link Connection#isValid(int)} call and reported in {@code database}.</p>
 */
@Service
public class HealthService {

    static final String UP = "UP";
    static final String DOWN = "DOWN";
    static final String DISABLED = "DISABLED";
    private static final int DB_CHECK_TIMEOUT_SECONDS = 2;
    private static final Logger log = LoggerFactory.getLogger(HealthService.class);

    private final String applicationName;
    private final ObjectProvider<DataSource> dataSource;

    /**
     * Creates the service.
     *
     * @param applicationName value of {@code spring.application.name}
     * @param dataSource      the database connection pool; absent with the 'nodb' profile
     */
    public HealthService(@Value("${spring.application.name}") String applicationName, ObjectProvider<DataSource> dataSource) {
        this.applicationName = applicationName;
        this.dataSource = dataSource;
    }

    /**
     * Returns the current health status of the application.
     *
     * @return API status, application name and database connectivity
     */
    public HealthResponse getHealth() {
        return new HealthResponse(UP, applicationName, checkDatabase());
    }

    private String checkDatabase() {
        DataSource source = dataSource.getIfAvailable();
        if (source == null) {
            return DISABLED;
        }
        try (Connection connection = source.getConnection()) {
            return connection.isValid(DB_CHECK_TIMEOUT_SECONDS) ? UP : DOWN;
        } catch (SQLException ex) {
            // Logged for developers only; the response just says DOWN.
            log.warn("Database health check failed: {}", ex.getMessage());
            return DOWN;
        }
    }
}
