package com.unimarket.controller;

import com.unimarket.dto.HealthResponse;
import com.unimarket.service.HealthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoint used to check that the UniMarket API is running.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final HealthService healthService;

    /**
     * Creates the controller.
     *
     * @param healthService service that builds the health information
     */
    public HealthController(HealthService healthService) {
        this.healthService = healthService;
    }

    /**
     * Handles {@code GET /api/health}.
     *
     * @return the current application health, e.g.
     *         {@code {"status":"UP","application":"UniMarket","database":"UP"}}
     */
    @GetMapping
    public HealthResponse getHealth() {
        return healthService.getHealth();
    }
}
