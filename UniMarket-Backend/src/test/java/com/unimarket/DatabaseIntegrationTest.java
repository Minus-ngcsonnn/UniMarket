package com.unimarket;

import com.unimarket.entity.Category;
import com.unimarket.repository.CampusRepository;
import com.unimarket.repository.CategoryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Read-only checks against the real UniMarketJava database.
 *
 * <p>Starting the context already runs Hibernate's schema validation
 * ({@code ddl-auto=validate}) for every entity. The tests below only read data.</p>
 *
 * <p>Skipped unless {@code UNIMARKET_DB_IT=true} is set, because it needs SQL Server and
 * the {@code DB_URL}/{@code DB_USERNAME}/{@code DB_PASSWORD} settings (environment
 * variables or UniMarket-Backend/.env).</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_DB_IT", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DatabaseIntegrationTest {

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private CategoryRepository categories;

    @Autowired
    private CampusRepository campuses;

    @Test
    @SuppressWarnings("rawtypes")
    void healthReportsDatabaseUp() {
        ResponseEntity<Map> response = rest.getForEntity("/api/health", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "UP").containsEntry("database", "UP");
    }

    @Test
    void readsLookupDataFromTheSqlScript() {
        assertThat(categories.findByActiveTrueOrderByNameAsc())
                .extracting(Category::getName)
                .contains("Textbooks", "Electronics", "Dormitory items", "Fashion", "Study equipment");
    }

    @Test
    @Transactional(readOnly = true)
    void campusBelongsToFptUniversity() {
        assertThat(campuses.findAll())
                .anySatisfy(campus -> {
                    assertThat(campus.getName()).isEqualTo("FPT Hoa Lac");
                    assertThat(campus.getUniversity().getCode()).isEqualTo("FPT");
                });
    }
}
