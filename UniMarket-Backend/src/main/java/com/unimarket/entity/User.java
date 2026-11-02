package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDateTime;

/**
 * Maps {@code dbo.Users} (UniMarket_BusinessAligned.sql, module 1).
 *
 * <p>One account per student; the same account buys and sells. Times are UTC.
 * The password is only ever stored as a BCrypt hash ({@code PasswordHash}).</p>
 */
@Entity
@Table(name = "Users", schema = "dbo")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UserId")
    private Integer id;

    @Column(name = "Email", nullable = false, length = 254, unique = true)
    private String email;

    @Column(name = "PasswordHash", nullable = false, length = 255)
    private String passwordHash;

    @Nationalized
    @Column(name = "FullName", nullable = false, length = 150)
    private String fullName;

    @Column(name = "Phone", length = 20)
    private String phone;

    @Nationalized
    @Column(name = "ZaloUrl", length = 500)
    private String zaloUrl;

    @Column(name = "ShowContact", nullable = false)
    private boolean showContact;

    @Nationalized
    @Column(name = "AvatarUrl", length = 1000)
    private String avatarUrl;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CampusId", nullable = false)
    private Campus campus;

    @Convert(converter = UserRole.DatabaseConverter.class)
    @Column(name = "Role", nullable = false, length = 10)
    private UserRole role;

    @Convert(converter = UserStatus.DatabaseConverter.class)
    @Column(name = "Status", nullable = false, length = 12)
    private UserStatus status;

    @Column(name = "EmailVerifiedAt")
    private LocalDateTime emailVerifiedAt;

    @Column(name = "CreatedAt", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "UpdatedAt", nullable = false)
    private LocalDateTime updatedAt;

    /** Required by JPA. */
    protected User() {
    }

    /**
     * Creates a new, unverified, active student account. Admin accounts cannot be created here.
     *
     * @param email        normalized (lower-case) institutional email
     * @param passwordHash BCrypt hash of the password
     * @param fullName     display name
     * @param campus       the student's campus
     * @param nowUtc       creation time (UTC)
     * @return the new account, not yet saved
     */
    public static User newStudent(String email, String passwordHash, String fullName, Campus campus, LocalDateTime nowUtc) {
        User user = new User();
        user.email = email;
        user.passwordHash = passwordHash;
        user.fullName = fullName;
        user.campus = campus;
        user.role = UserRole.STUDENT;
        user.status = UserStatus.ACTIVE;
        user.showContact = false;
        user.createdAt = nowUtc;
        user.updatedAt = nowUtc;
        return user;
    }

    /** @return true when the account may sign in: active and email verified */
    public boolean canSignIn() {
        return status == UserStatus.ACTIVE && emailVerifiedAt != null;
    }

    public Integer getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getFullName() {
        return fullName;
    }

    public Campus getCampus() {
        return campus;
    }

    public UserRole getRole() {
        return role;
    }

    public UserStatus getStatus() {
        return status;
    }

    public LocalDateTime getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
