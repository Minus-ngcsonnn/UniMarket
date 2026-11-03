package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

/**
 * Maps {@code dbo.Campuses} (UniMarket_BusinessAligned.sql, module 1).
 * Every user and listing belongs to one campus, e.g. "FPT Hoa Lac".
 */
@Entity
@Table(name = "Campuses", schema = "dbo")
public class Campus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CampusId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "UniversityId", nullable = false)
    private University university;

    @Nationalized
    @Column(name = "Name", nullable = false, length = 150)
    private String name;

    @Nationalized
    @Column(name = "Address", length = 500)
    private String address;

    /** V003: the demo area of this campus (every campus has one after V003). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ZoneId")
    private LocationZone zone;

    /** Required by JPA. */
    protected Campus() {
    }

    public Integer getId() {
        return id;
    }

    public University getUniversity() {
        return university;
    }

    public String getName() {
        return name;
    }

    public String getAddress() {
        return address;
    }

    public LocationZone getZone() {
        return zone;
    }
}
