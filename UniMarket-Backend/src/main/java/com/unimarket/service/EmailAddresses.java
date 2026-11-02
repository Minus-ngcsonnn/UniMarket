package com.unimarket.service;

import java.util.Locale;

/**
 * Email address helpers. Addresses are compared and stored trimmed and in lower case.
 */
public final class EmailAddresses {

    private EmailAddresses() {
    }

    /** @return the trimmed, lower-case address ({@code null} stays {@code null}) */
    public static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    /** @return the domain part after the last '@', lower case, or an empty string */
    public static String domainOf(String normalizedEmail) {
        int at = normalizedEmail.lastIndexOf('@');
        return at < 0 ? "" : normalizedEmail.substring(at + 1);
    }
}
