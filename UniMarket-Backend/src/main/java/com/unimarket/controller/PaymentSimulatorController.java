package com.unimarket.controller;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.dto.order.PaymentResponses;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.PaymentResultService;
import com.unimarket.service.order.PaymentSimulator;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * SANDBOX payment simulator endpoints. Registered only when {@code unimarket.payment.simulator.enabled=true}
 * (development and tests); in production they do not exist (404). Simulated: no provider, no money.
 */
@RestController
@Profile("!nodb")
@ConditionalOnProperty(name = "unimarket.payment.simulator.enabled", havingValue = "true")
public class PaymentSimulatorController {

    /** Header carrying the HMAC-SHA256 signature of a simulated provider notification. */
    public static final String SIGNATURE_HEADER = "X-Simulator-Signature";

    private final PaymentSimulator simulator;

    public PaymentSimulatorController(PaymentSimulator simulator) {
        this.simulator = simulator;
    }

    /**
     * The buyer finishes a pending sandbox payment on the simulator ("pay" or "fail"); the simulator then notifies the
     * server like a provider would (signed), and the result is verified and recorded.
     */
    @PostMapping("/api/dev/payment-simulator/payments/{paymentId}/complete")
    public OrderResponse complete(@PathVariable long paymentId, @Valid @RequestBody Outcome request,
                                  @AuthenticationPrincipal AuthenticatedUser user) {
        boolean success = switch (request.outcome().trim().toUpperCase(java.util.Locale.ROOT)) {
            case "SUCCESS" -> true;
            case "FAILURE" -> false;
            default -> throw new ValidationException(List.of(new ApiErrorResponse.FieldError("outcome", "must be SUCCESS or FAILURE")));
        };
        return simulator.complete(paymentId, success, user);
    }

    /**
     * Provider → server notification of the simulator. Public (a provider has no user token) but only accepted with a
     * valid {@value #SIGNATURE_HEADER} (HMAC-SHA256 with {@code PAYMENT_SIMULATOR_SECRET}).
     */
    @PostMapping("/api/dev/payment-simulator/callback")
    public PaymentResponses.CallbackResult callback(@RequestBody PaymentResultService.PaymentNotification notification,
                                                    @RequestHeader(name = SIGNATURE_HEADER, required = false) String signature) {
        return simulator.receive(notification, signature);
    }

    /** @param outcome SUCCESS or FAILURE */
    public record Outcome(@NotBlank String outcome) {
    }
}
