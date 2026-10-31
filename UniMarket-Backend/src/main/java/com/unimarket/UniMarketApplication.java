package com.unimarket;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point of the UniMarket backend application.
 *
 * <p>Bootstraps the Spring context and scans all components under the
 * {@code com.unimarket} base package.</p>
 */
@SpringBootApplication
public class UniMarketApplication {

    /**
     * Starts the UniMarket Spring Boot application.
     *
     * @param args command-line arguments passed to Spring Boot
     */
    public static void main(String[] args) {
        SpringApplication.run(UniMarketApplication.class, args);
    }
}
