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
 * Inactive categories ({@code IsActive = 0}) are hidden from the catalog.
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
}
