package com.unimarket.repository;

import com.unimarket.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Access to {@code dbo.PasswordResetTokens}. Codes are only ever looked up by their digest.
 */
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    /** @return true when a code with this digest exists (digests are unique in the table) */
    boolean existsByTokenHash(byte[] tokenHash);

    /** @return the most recently issued code of a user */
    Optional<PasswordResetToken> findTopByUserIdOrderByCreatedAtDescIdDesc(Integer userId);

    /** @return how many codes were issued to a user since the given time (resend limit) */
    long countByUserIdAndCreatedAtAfter(Integer userId, LocalDateTime since);

    /**
     * Closes every still-usable code of a user, e.g. when a new code replaces it or after too
     * many wrong attempts. Rows are kept for auditing.
     *
     * @return number of codes closed
     */
    /**
     * Consumes a code atomically: succeeds only for an open, unexpired code of this user with this digest, so a code
     * can be used once even when two requests race.
     *
     * @return 1 when the code was valid and is now consumed, otherwise 0
     */
    @Modifying
    @Query("update PasswordResetToken t set t.consumedAt = :now where t.userId = :userId and t.tokenHash = :tokenHash "
            + "and t.consumedAt is null and t.expiresAt > :now")
    int consume(@Param("userId") Integer userId, @Param("tokenHash") byte[] tokenHash, @Param("now") LocalDateTime now);

    @Modifying
    @Query("update PasswordResetToken t set t.consumedAt = :now where t.userId = :userId and t.consumedAt is null")
    int closeOpenCodes(@Param("userId") Integer userId, @Param("now") LocalDateTime now);
}
