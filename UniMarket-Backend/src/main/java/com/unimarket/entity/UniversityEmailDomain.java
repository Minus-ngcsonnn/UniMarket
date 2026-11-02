package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * Maps {@code dbo.UniversityEmailDomains}: an institutional email domain (e.g. {@code fpt.edu.vn})
 * and the university it belongs to. Registration only accepts these domains.
 */
@Entity
@Table(name = "UniversityEmailDomains", schema = "dbo")
public class UniversityEmailDomain {

    @Id
    @Column(name = "Domain", length = 150)
    private String domain;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "UniversityId", nullable = false)
    private University university;

    /** Required by JPA. */
    protected UniversityEmailDomain() {
    }

    public String getDomain() {
        return domain;
    }

    public University getUniversity() {
        return university;
    }
}
