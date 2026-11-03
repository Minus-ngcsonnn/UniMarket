package com.unimarket.repository;

import com.unimarket.entity.LocationZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Read access to {@code dbo.LocationZones} (V003). */
public interface LocationZoneRepository extends JpaRepository<LocationZone, Integer> {

    /** @return active zones ordered by province, then name */
    List<LocationZone> findByActiveTrueOrderByProvinceAscNameAsc();
}
