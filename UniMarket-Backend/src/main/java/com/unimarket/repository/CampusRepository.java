package com.unimarket.repository;

import com.unimarket.entity.Campus;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Read access to {@code dbo.Campuses}.
 */
public interface CampusRepository extends JpaRepository<Campus, Integer> {
}
