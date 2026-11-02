package com.unimarket.dto;

/**
 * Response body returned by {@code GET /api/health}.
 *
 * <p>{@code status} reports whether the API process is running (the frontend's
 * developer badge reads it). {@code database} reports whether SQL Server answered a
 * short connectivity check; it never contains connection details.</p>
 *
 * @param status      application status, {@code "UP"} while the API is running
 * @param application name of the running application
 * @param database    database connectivity: {@code "UP"}, {@code "DOWN"} or
 *                    {@code "DISABLED"} (started without a database, 'nodb' profile)
 */
public record HealthResponse(String status, String application, String database) {
}
