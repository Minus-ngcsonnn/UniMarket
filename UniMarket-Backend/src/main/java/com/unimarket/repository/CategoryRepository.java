package com.unimarket.repository;

import com.unimarket.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Read access to {@code dbo.Categories}. Used by the catalog in Backend Stage 2+.
 */
public interface CategoryRepository extends JpaRepository<Category, Integer> {

    /** @return active categories in name order */
    List<Category> findByActiveTrueOrderByNameAsc();
}
