package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

/**
 * Maps {@code dbo.Categories} (UniMarket_BusinessAligned.sql, module 2).
 * Inactive categories ({@code IsActive = 0}) are hidden from the catalog. A category with {@code AllowsCustomName = 1}
 * (V005: the official "Other" category) asks the seller to type the product's category ({@code Products.CustomCategoryName}).
 */
@Entity
@Table(name = "Categories", schema = "dbo")
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CategoryId")
    private Integer id;

    @Nationalized
    @Column(name = "Name", nullable = false, length = 100, unique = true)
    private String name;

    @Column(name = "IsActive", nullable = false)
    private boolean active;

    @Column(name = "AllowsCustomName", nullable = false)
    private boolean allowsCustomName;

    /** Required by JPA. */
    protected Category() {
    }

    public Integer getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public boolean isActive() {
        return active;
    }

    /** @return true for the "Other" category: its listings carry a seller-typed category name */
    public boolean allowsCustomName() {
        return allowsCustomName;
    }
}
