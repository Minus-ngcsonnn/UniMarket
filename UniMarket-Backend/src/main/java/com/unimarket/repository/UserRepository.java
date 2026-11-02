package com.unimarket.repository;

import com.unimarket.entity.User;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Access to {@code dbo.Users}. Emails are stored and looked up in lower case.
 */
public interface UserRepository extends JpaRepository<User, Integer> {

    /** @return the account with this (lower-case) email */
    Optional<User> findByEmail(String email);

    /** @return the account with its campus and university loaded, for profile responses */
    @EntityGraph(attributePaths = {"campus", "campus.university"})
    Optional<User> findWithCampusById(Integer id);

    /** @return true when an account already uses this (lower-case) email */
    boolean existsByEmail(String email);
}
