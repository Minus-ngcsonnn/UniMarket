package com.unimarket.service.product;

import com.unimarket.entity.ProductCondition;

import java.util.List;

/**
 * Validated catalog search parameters.
 *
 * @param q            keyword in the title
 * @param categoryId   category filter
 * @param conditions   condition filter (any of)
 * @param campusId     campus filter
 * @param universityId university filter
 * @param sellerId     one seller's listings (public profile / shop page)
 * @param minPrice    minimum price (VND)
 * @param maxPrice     maximum price (VND)
 * @param featured     only listings with a running paid promotion
 * @param deals        only "student deals" (at least 40 % below the original price)
 * @param sort         newest, price_asc or price_desc
 * @param page         1-based page
 * @param size         page size (1–50)
 * @param zoneId       V003 demo pickup area: listings whose effective pickup zone (explicit zone, else campus zone) is it
 * @param province     V003 province / city of the effective pickup zone ({@code LocationZones.Province}, exact value)
 */
public record CatalogQuery(String q, Integer categoryId, List<ProductCondition> conditions, Integer campusId, Integer universityId,
                           Integer sellerId, Long minPrice, Long maxPrice, boolean featured, boolean deals, CatalogSort sort, int page, int size,
                           Integer zoneId, String province) {

    /** Query without location filters (Stage 3 signature). */
    public CatalogQuery(String q, Integer categoryId, List<ProductCondition> conditions, Integer campusId, Integer universityId,
                        Integer sellerId, Long minPrice, Long maxPrice, boolean featured, boolean deals, CatalogSort sort, int page, int size) {
        this(q, categoryId, conditions, campusId, universityId, sellerId, minPrice, maxPrice, featured, deals, sort, page, size, null, null);
    }

    /** Whitelisted sort orders; anything else is rejected with 400. */
    public enum CatalogSort {
        NEWEST, PRICE_ASC, PRICE_DESC;

        /** @return the sort for a request value such as {@code price_asc} */
        public static CatalogSort fromParameter(String value) {
            return value == null || value.isBlank() ? NEWEST : valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        }
    }
}
