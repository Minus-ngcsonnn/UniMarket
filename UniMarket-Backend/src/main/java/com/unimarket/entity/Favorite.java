package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * Maps {@code dbo.Favorites} ("Saved items"): primary key {@code (UserId, ProductId)}, so a user can
 * save a listing at most once. A favorite is never an order.
 */
@Entity
@Table(name = "Favorites", schema = "dbo")
@IdClass(Favorite.Key.class)
public class Favorite {

    @Id
    @Column(name = "UserId")
    private Integer userId;

    @Id
    @Column(name = "ProductId")
    private Integer productId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ProductId", insertable = false, updatable = false)
    private Product product;

    @Column(name = "CreatedAt", nullable = false)
    private LocalDateTime createdAt;

    /** Required by JPA. */
    protected Favorite() {
    }

    public Favorite(Integer userId, Integer productId, LocalDateTime createdAt) {
        this.userId = userId;
        this.productId = productId;
        this.createdAt = createdAt;
    }

    public Integer getUserId() { return userId; }
    public Integer getProductId() { return productId; }
    public Product getProduct() { return product; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    /** Composite key of {@link Favorite}. */
    public static class Key implements Serializable {
        private Integer userId;
        private Integer productId;

        public Key() {
        }

        public Key(Integer userId, Integer productId) {
            this.userId = userId;
            this.productId = productId;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key key && Objects.equals(userId, key.userId) && Objects.equals(productId, key.productId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, productId);
        }
    }
}
