package com.unimarket.controller;

import com.unimarket.dto.auth.ForgotPasswordRequest;
import com.unimarket.dto.auth.LoginRequest;
import com.unimarket.dto.auth.LoginResponse;
import com.unimarket.dto.auth.MessageResponse;
import com.unimarket.dto.auth.RegisterRequest;
import com.unimarket.dto.auth.RegisterResponse;
import com.unimarket.dto.auth.ResendVerificationRequest;
import com.unimarket.dto.auth.ResetPasswordRequest;
import com.unimarket.dto.auth.UserResponse;
import com.unimarket.dto.auth.VerifyEmailRequest;
import com.unimarket.dto.auth.VerifyEmailResponse;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.AuthService;
import com.unimarket.service.EmailVerificationService;
import com.unimarket.service.PasswordResetService;
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
    private final PasswordResetService passwordResetService;

    public AuthController(AuthService authService, EmailVerificationService verificationService,
                          PasswordResetService passwordResetService) {
        this.authService = authService;
        this.verificationService = verificationService;
        this.passwordResetService = passwordResetService;
    }

    /** Public. Creates an unverified student account and e-mails a 6-digit code. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisterResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    /**
     * Public. Verifies the account with the e-mailed code and signs it in (access token, like {@code /login}), so the
     * student does not have to enter the password again. No token is issued unless the code was valid.
     */
    @PostMapping("/verify-email")
    public VerifyEmailResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        int userId = verificationService.verify(request.email(), request.code());
        return VerifyEmailResponse.of("Your email is verified. You are now signed in.", authService.signInVerified(userId));
    }

    /** Public. Always answers the same way, whether or not a code was actually sent. */
    @PostMapping("/resend-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public MessageResponse resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        verificationService.resend(request.email());
        return new MessageResponse("If this email belongs to an account that still needs verification, a new code has been sent. "
                + "You can request a new code once a minute, up to 5 times per hour.");
    }

    /** Public. E-mails a password-reset code. Always answers the same way, whether or not the email is registered. */
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public MessageResponse forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResetService.requestReset(request.email());
        return new MessageResponse("If this email belongs to a UniMarket account, a password reset code has been sent. "
                + "You can request a new code once a minute, up to 5 times per hour.");
    }

    /** Public. Sets a new password with the e-mailed reset code. The user then signs in with the new password. */
    @PostMapping("/reset-password")
    public MessageResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.email(), request.code(), request.newPassword());
        return new MessageResponse("Your password has been changed. Sign in with your new password.");
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
