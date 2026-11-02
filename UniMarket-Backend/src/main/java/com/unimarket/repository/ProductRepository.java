package com.unimarket.repository;

import com.unimarket.entity.Product;
import com.unimarket.entity.ProductStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Access to {@code dbo.Products}. Catalog pages load category, campus, university and seller in the same
 * query (entity graph) to avoid N+1 selects.
 */
public interface ProductRepository extends JpaRepository<Product, Integer>, JpaSpecificationExecutor<Product> {

    /** Catalog page with its references joined. */
    @Override
    @EntityGraph(attributePaths = {"category", "campus", "campus.university", "seller"})
    Page<Product> findAll(Specification<Product> spec, Pageable pageable);

    /** Product page: references and photos in one go. */
    @EntityGraph(attributePaths = {"category", "campus", "campus.university", "seller", "images"})
    Optional<Product> findWithDetailsById(Integer id);

    /** Locks the row (UPDLOCK) before an edit, so it cannot race with a checkout of the same item. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id")
    Optional<Product> findForUpdateById(@Param("id") Integer id);

    /** A seller's own listings except removed ones ("My listings"). */
    @EntityGraph(attributePaths = {"category", "campus", "campus.university", "seller"})
    List<Product> findBySeller_IdAndStatusNot(Integer sellerId, ProductStatus excluded, Sort sort);
}
