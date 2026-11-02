package com.unimarket.repository;

import com.unimarket.entity.Campus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Read access to {@code dbo.Campuses}.
 */
public interface CampusRepository extends JpaRepository<Campus, Integer> {

    /** @return the campuses of one university */
    List<Campus> findByUniversity_Id(Integer universityId);
}
