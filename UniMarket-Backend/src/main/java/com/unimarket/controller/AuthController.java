package com.unimarket.controller;

import com.unimarket.dto.auth.LoginRequest;
import com.unimarket.dto.auth.LoginResponse;
import com.unimarket.dto.auth.MessageResponse;
import com.unimarket.dto.auth.RegisterRequest;
import com.unimarket.dto.auth.RegisterResponse;
import com.unimarket.dto.auth.ResendVerificationRequest;
import com.unimarket.dto.auth.UserResponse;
import com.unimarket.dto.auth.VerifyEmailRequest;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.AuthService;
import com.unimarket.service.EmailVerificationService;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Authentication API ({@code /api/auth}). See {@code UniMarket-Backend/docs/AUTH_API.md}.
 *
 * <p>There is no logout endpoint: tokens are stateless, the browser signs out by deleting its token.
 * An issued token stays valid until it expires (no server-side revocation).</p>
 */
@RestController
@RequestMapping("/api/auth")
@Profile("!nodb")
public class AuthController {

    private final AuthService authService;
    private final EmailVerificationService verificationService;

    public AuthController(AuthService authService, EmailVerificationService verificationService) {
        this.authService = authService;
        this.verificationService = verificationService;
    }

    /** Public. Creates an unverified student account and e-mails a 6-digit code. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisterResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    /** Public. Verifies the account with the e-mailed code. */
    @PostMapping("/verify-email")
    public MessageResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        verificationService.verify(request.email(), request.code());
        return new MessageResponse("Your email is verified. You can now sign in.");
    }

    /** Public. Always answers the same way, whether or not a code was actually sent. */
    @PostMapping("/resend-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public MessageResponse resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        verificationService.resend(request.email());
        return new MessageResponse("If this email belongs to an account that still needs verification, a new code has been sent. "
                + "You can request a new code once a minute, up to 5 times per hour.");
    }

    /** Public. Returns an access token for a verified, active account. */
    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** Requires a token. The signed-in account. */
    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser user) {
        return authService.currentUser(user);
    }
}
