package com.unimarket.security;

import com.unimarket.entity.User;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * Binds access tokens to the account's current password, so a password reset ends every older session.
 *
 * <p>Each token carries the claim {@value #CLAIM}: a keyed fingerprint
 * {@code HMAC-SHA-256(JWT key, "pwv:" + userId + ":" + Users.PasswordHash)} (first 128 bits, base64url). On every request
 * {@link DatabaseUserJwtConverter} recomputes it from the stored hash. A reset stores a new BCrypt hash (new salt), so
 * tokens issued before it no longer match and are rejected with 401. No schema change is needed: the existing
 * {@code PasswordHash} column is the version. The fingerprint reveals nothing about the password (it is keyed with the
 * server secret and derived from a salted BCrypt hash), and it cannot be forged because the token is signed with the
 * same secret. Tokens without the claim are rejected.</p>
 */
@Component
public class PasswordStamp {

    /** JWT claim name. */
    public static final String CLAIM = "pwv";

    private static final String HMAC = "HmacSHA256";
    private final SecretKey key;

    /** @param jwtSigningKey the HS256 key of the access tokens */
    public PasswordStamp(SecretKey jwtSigningKey) {
        this.key = jwtSigningKey;
    }

    /** @return the fingerprint of the account's current password hash */
    public String of(User user) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(key);
            byte[] digest = mac.doFinal(("pwv:" + user.getId() + ":" + user.getPasswordHash()).getBytes(StandardCharsets.UTF_8));
            byte[] truncated = new byte[16];
            System.arraycopy(digest, 0, truncated, 0, truncated.length);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(truncated);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA-256 is not available", ex);
        }
    }

    /** @return true when {@code claim} matches the account's current password (constant-time comparison) */
    public boolean matches(User user, String claim) {
        if (claim == null || claim.isEmpty()) {
            return false;
        }
        return MessageDigest.isEqual(of(user).getBytes(StandardCharsets.US_ASCII), claim.getBytes(StandardCharsets.US_ASCII));
    }
}
