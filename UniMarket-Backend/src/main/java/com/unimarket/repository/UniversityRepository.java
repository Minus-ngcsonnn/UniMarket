package com.unimarket.repository;

import com.unimarket.entity.University;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Read access to {@code dbo.Universities}.
 */
public interface UniversityRepository extends JpaRepository<University, Integer> {

    /** @return all universities by name */
    List<University> findAllByOrderByNameAsc();
}
