package com.unimarket.repository;

import com.unimarket.entity.ProductImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/**
 * Access to {@code dbo.ProductImages}.
 */
public interface ProductImageRepository extends JpaRepository<ProductImage, Integer> {

    /** @return a listing's photos, main photo first */
    List<ProductImage> findByProduct_IdOrderBySortOrderAsc(Integer productId);

    /** @return the main photo (lowest SortOrder) of each listing, in one query for a whole page */
    @Query("select i from ProductImage i where i.product.id in :ids and i.sortOrder = "
            + "(select min(j.sortOrder) from ProductImage j where j.product.id = i.product.id)")
    List<ProductImage> findMainImages(@Param("ids") Collection<Integer> productIds);

    long countByProduct_Id(Integer productId);
}
