package com.unimarket.security;

import com.unimarket.entity.User;
import com.unimarket.repository.UserRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

import java.util.List;
import java.util.Optional;

/**
 * Turns a validated JWT into the signed-in account.
 *
 * <p>The signature, issuer, audience and expiry are already checked by the JWT decoder. Here the
 * account is loaded from {@code dbo.Users} on every request: if it no longer exists, is not active
 * or not verified, or its password was changed after the token was issued ({@link PasswordStamp}), the token is
 * rejected (401). The role comes from the database, never from the
 * token or the frontend.</p>
 */
public class DatabaseUserJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final ObjectProvider<UserRepository> users;
    private final PasswordStamp passwordStamp;

    /**
     * @param users         account repository; absent with the 'nodb' profile, where every token is rejected
     * @param passwordStamp checks the token's {@code pwv} claim against the current password hash
     */
    public DatabaseUserJwtConverter(ObjectProvider<UserRepository> users, PasswordStamp passwordStamp) {
        this.users = users;
        this.passwordStamp = passwordStamp;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        UserRepository repository = users.getIfAvailable();
        Integer userId = parseUserId(jwt.getSubject());
        Optional<User> user = repository == null || userId == null ? Optional.empty() : repository.findById(userId);
        User account = user.filter(User::canSignIn)
                .filter(found -> passwordStamp.matches(found, jwt.getClaimAsString(PasswordStamp.CLAIM)))
                .orElseThrow(() -> new InvalidBearerTokenException("The account for this token cannot sign in."));
        AuthenticatedUser principal = new AuthenticatedUser(account.getId(), account.getEmail(), account.getRole());
        return new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority(account.getRole().authority())));
    }

    private static Integer parseUserId(String subject) {
        try {
            return subject == null ? null : Integer.valueOf(subject);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
