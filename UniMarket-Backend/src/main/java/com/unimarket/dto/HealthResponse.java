package com.unimarket.dto;

/**
 * Response body returned by the health-check endpoint.
 *
 * @param status      current application status, for example {@code "UP"}
 * @param application name of the running application
 */
public record HealthResponse(String status, String application) {
}
