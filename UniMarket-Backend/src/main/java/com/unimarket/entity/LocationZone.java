package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

import java.math.BigDecimal;

/**
 * Maps {@code dbo.LocationZones} (V003). A demo delivery / pickup AREA with one approximate reference point
 * (OpenStreetMap, see the migration). Used only for simulated shipping distances; never an address.
 * Read-only for the application (rows are managed by data scripts).
 */
@Entity
@Table(name = "LocationZones", schema = "dbo")
public class LocationZone {

    @Id
    @Column(name = "ZoneId")
    private Integer id;

    @Column(name = "Code", nullable = false, length = 30)
    private String code;

    @Nationalized
    @Column(name = "Name", nullable = false, length = 150)
    private String name;

    @Nationalized
    @Column(name = "Province", nullable = false, length = 100)
    private String province;

    @Column(name = "Latitude", nullable = false, precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "Longitude", nullable = false, precision = 9, scale = 6)
    private BigDecimal longitude;

    @Column(name = "IsActive", nullable = false)
    private boolean active;

    /** Required by JPA. */
    protected LocationZone() {
    }

    public Integer getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getProvince() { return province; }
    public BigDecimal getLatitude() { return latitude; }
    public BigDecimal getLongitude() { return longitude; }
    public boolean isActive() { return active; }
}
