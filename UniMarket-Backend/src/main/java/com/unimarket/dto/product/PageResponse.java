package com.unimarket.dto.product;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * One page of results.
 *
 * @param items      items of this page
 * @param page       1-based page number (like the frontend)
 * @param size       requested page size
 * @param totalItems number of matching items
 * @param totalPages number of pages
 * @param facets     catalog only: counts per condition / categoryId / campusId for the keyword
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages, Facets facets) {

    /**
     * @param conditions {@code NEW|LIKE_NEW|USED} → count
     * @param categories categoryId → count
     * @param campuses   campusId → count
     */
    public record Facets(Map<String, Long> conditions, Map<String, Long> categories, Map<String, Long> campuses) {
    }
}
