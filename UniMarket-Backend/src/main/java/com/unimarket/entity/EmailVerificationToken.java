package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

/**
 * Maps {@code dbo.EmailVerificationTokens}: one issued verification code.
 *
 * <p>Only an HMAC-SHA-256 digest of the code is stored ({@code TokenHash}, binary(32)); the code
 * itself is never persisted. {@code ConsumedAt} is set when the code is used, replaced by a newer
 * code, or blocked after too many wrong attempts.</p>
 */
@Entity
@Table(name = "EmailVerificationTokens", schema = "dbo")
public class EmailVerificationToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "TokenId")
    private Long id;

    @Column(name = "UserId", nullable = false)
    private Integer userId;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "TokenHash", nullable = false, length = 32, unique = true)
    private byte[] tokenHash;

    @Column(name = "CreatedAt", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "ExpiresAt", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "ConsumedAt")
    private LocalDateTime consumedAt;

    /** Required by JPA. */
    protected EmailVerificationToken() {
    }

    /**
     * @param userId    owner of the code
     * @param tokenHash HMAC digest of the code (32 bytes)
     * @param createdAt issue time (UTC)
     * @param expiresAt expiry time (UTC), after {@code createdAt}
     */
    public EmailVerificationToken(Integer userId, byte[] tokenHash, LocalDateTime createdAt, LocalDateTime expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash.clone();
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public Long getId() {
        return id;
    }

    public Integer getUserId() {
        return userId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public LocalDateTime getConsumedAt() {
        return consumedAt;
    }
}
