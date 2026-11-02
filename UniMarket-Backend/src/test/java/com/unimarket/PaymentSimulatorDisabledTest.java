package com.unimarket;

import com.unimarket.config.OrderExpiryScheduler;
import com.unimarket.controller.PaymentSimulatorController;
import com.unimarket.entity.User;
import com.unimarket.repository.UserRepository;
import com.unimarket.security.JwtService;
import com.unimarket.service.order.PaymentSimulator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * With the simulator switched off (the default outside the dev profile, i.e. production), the sandbox payment
 * endpoints do not exist and no simulator bean is created. Read-only: no row is written (the token is issued for an
 * existing account without signing in).
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_DB_IT", matches = "true")
@SpringBootTest(properties = {"unimarket.payment.simulator.enabled=false"})
@AutoConfigureMockMvc
class PaymentSimulatorDisabledTest {

    @Autowired private MockMvc mvc;
    @Autowired private ApplicationContext context;
    @Autowired private JwtService jwt;
    @Autowired private UserRepository users;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void sandboxPaymentEndpointsDoNotExist() throws Exception {
        assertThat(context.getBeanNamesForType(PaymentSimulator.class)).isEmpty();
        assertThat(context.getBeanNamesForType(PaymentSimulatorController.class)).isEmpty();
        // Provider-style callback (public path): no handler.
        mvc.perform(post("/api/dev/payment-simulator/callback").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Simulator-Signature", "00").content("{\"requestKey\":\"x\",\"providerReference\":\"y\",\"amount\":1,\"success\":true,\"provider\":\"MOMO\"}"))
                .andExpect(status().isNotFound());
        // Completing a payment, even signed in: no handler.
        Integer userId = jdbc.queryForObject("SELECT TOP 1 UserId FROM dbo.Users WHERE Role = 'Student' AND Status = 'Active' "
                + "AND EmailVerifiedAt IS NOT NULL ORDER BY UserId", Integer.class);
        User user = users.findById(userId).orElseThrow();
        String token = jwt.issueAccessToken(user).value();
        mvc.perform(post("/api/dev/payment-simulator/payments/1/complete").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isNotFound());
    }

    @Test
    void theExpiryJobIsOffInLocalDevelopmentUnlessEnabled() {
        // Default profile is "dev": starting the backend against the shared demo database must not expire demo orders.
        assertThat(context.getEnvironment().getProperty("unimarket.orders.expiry.enabled", Boolean.class)).isFalse();
        assertThat(context.getBeanNamesForType(OrderExpiryScheduler.class)).isEmpty();
    }
}
