package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

/**
 * Maps {@code dbo.Universities} (UniMarket_BusinessAligned.sql, module 1).
 * Lookup data, e.g. FPT University (code {@code FPT}).
 */
@Entity
@Table(name = "Universities", schema = "dbo")
public class University {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UniversityId")
    private Integer id;

    @Nationalized
    @Column(name = "Name", nullable = false, length = 200)
    private String name;

    @Column(name = "Code", nullable = false, length = 30, unique = true)
    private String code;

    /** Required by JPA. */
    protected University() {
    }

    public Integer getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getCode() {
        return code;
    }
}
