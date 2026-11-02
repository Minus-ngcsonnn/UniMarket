package com.unimarket.repository;

import com.unimarket.entity.Favorite;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Access to {@code dbo.Favorites}; every query is scoped to one user id taken from the token.
 */
public interface FavoriteRepository extends JpaRepository<Favorite, Favorite.Key> {

    /** @return the user's saved listings with their references, newest first */
    @EntityGraph(attributePaths = {"product", "product.category", "product.campus", "product.campus.university", "product.seller"})
    List<Favorite> findByUserIdOrderByCreatedAtDesc(Integer userId);
}
