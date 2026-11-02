package com.unimarket.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

/**
 * Reads the signed-in account on public endpoints, where a token is optional
 * (e.g. the owner of a pending listing may open its page).
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    /** @return the signed-in account, or empty for an anonymous visitor */
    public static Optional<AuthenticatedUser> optional() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user
                ? Optional.of(user) : Optional.empty();
    }
}
