package com.unimarket.order;

import com.unimarket.config.OrderExpiryScheduler;
import com.unimarket.dto.order.OrderRequests;
import com.unimarket.service.order.OrderExpiryService;
import com.unimarket.service.order.OrderProcedures;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.order.PaymentResultService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/** Pure unit tests (no Spring, no database) for Stage 4 rules. */
class OrderRulesTest {

    @Test
    void statusesAndProvidersMapToTheDatabaseValues() {
        assertThat(OrderValues.orderStatus("AwaitingPayment")).isEqualTo("AWAITING_PAYMENT");
        assertThat(OrderValues.orderStatusSql("delivering")).contains("Delivering");
        assertThat(OrderValues.orderStatusSql("SHIPPED")).isEmpty();
        assertThat(OrderValues.upper("Succeeded")).isEqualTo("SUCCEEDED");
        assertThat(OrderValues.upper("RefundApproved")).isEqualTo("REFUND_APPROVED");
        assertThat(OrderValues.providerSql("momo")).contains("MoMo");
        assertThat(OrderValues.providerSql("ZALOPAY")).contains("ZaloPay");
        assertThat(OrderValues.providerSql("CARD")).as("only the providers allowed by the CHECK constraint").isEmpty();
        assertThat(OrderValues.provider("ZaloPay")).isEqualTo("ZALOPAY");
    }

    @Test
    void phoneRuleMatchesTheFrontend() {
        for (String ok : List.of("0912345678", "0912 345 678", "+84912345678", "091.234.5678", "0389-999-999")) {
            assertThat(ok.matches(OrderRequests.PHONE_PATTERN)).as(ok).isTrue();
        }
        for (String bad : List.of("12345", "0212345678", "091234567", "09123456789", "+8491234567x")) {
            assertThat(bad.matches(OrderRequests.PHONE_PATTERN)).as(bad).isFalse();
        }
    }

    @Test
    void theSignedNotificationTextCoversEveryField() {
        PaymentResultService.PaymentNotification n = new PaymentResultService.PaymentNotification("UMK-1", "SIM-2", 125_000, true, "MOMO");
        assertThat(n.canonical()).isEqualTo("UMK-1\nSIM-2\n125000\n1\nMOMO");
        assertThat(new PaymentResultService.PaymentNotification("UMK-1", "SIM-2", 125_000, false, "MOMO").canonical()).isNotEqualTo(n.canonical());
    }

    @Test
    void theSimulatorRefusesToStartInAProductionProfile() {
        for (String profile : List.of("prod", "production")) {
            org.springframework.mock.env.MockEnvironment environment = new org.springframework.mock.env.MockEnvironment();
            environment.setActiveProfiles(profile);
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> new com.unimarket.service.order.PaymentSimulator(
                            null, null, null, "", true, environment))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("production");
        }
    }

    @Test
    void theShippingPolicyIsSimulatedAndSaysWhetherFeesAreIncluded() {
        com.unimarket.dto.order.CartResponse.ShippingFeePolicy cart = com.unimarket.dto.order.CartResponse.ShippingFeePolicy.simulatedDistance(false);
        assertThat(cart.method()).isEqualTo("SIMULATED_DISTANCE");
        assertThat(cart.simulated()).isTrue();
        assertThat(cart.freeRadiusKm()).isEqualTo(3);
        assertThat(cart.included()).isFalse();
        assertThat(cart.note()).contains("not included yet");
        assertThat(com.unimarket.dto.order.CartResponse.ShippingFeePolicy.simulatedDistance(true).included()).isTrue();
    }

    @Test
    void aFailingExpiryRunIsLoggedAndDoesNotStopTheScheduler() {
        AtomicInteger runs = new AtomicInteger();
        OrderExpiryService failing = new OrderExpiryService(null) {
            @Override
            public List<OrderProcedures.Expired> expireOverdueOrders() {
                runs.incrementAndGet();
                throw new IllegalStateException("database unavailable");
            }
        };
        OrderExpiryScheduler scheduler = new OrderExpiryScheduler(failing);
        assertThatCode(scheduler::run).doesNotThrowAnyException();
        assertThatCode(scheduler::run).doesNotThrowAnyException();
        assertThat(runs).hasValue(2);
    }
}
