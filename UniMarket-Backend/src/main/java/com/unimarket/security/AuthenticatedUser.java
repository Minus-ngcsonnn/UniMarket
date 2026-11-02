package com.unimarket.security;

import com.unimarket.entity.UserRole;

/**
 * The signed-in account, rebuilt from the database on every request (never from token claims
 * alone), so a suspended account or a changed role takes effect immediately.
 *
 * @param id    {@code Users.UserId}
 * @param email account email
 * @param role  current role from {@code Users.Role}
 */
public record AuthenticatedUser(Integer id, String email, UserRole role) {
}
