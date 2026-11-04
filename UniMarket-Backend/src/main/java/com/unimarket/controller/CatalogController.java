package com.unimarket.controller;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.dto.product.ProductDetailResponse;
import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.dto.product.ReferenceDataResponses;
import com.unimarket.dto.product.ReferenceDtos;
import com.unimarket.entity.ProductCondition;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.CurrentUser;
import com.unimarket.service.product.CatalogQuery;
import com.unimarket.service.product.CatalogService;
import com.unimarket.service.product.ReferenceDataService;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * Public, read-only marketplace endpoints: catalog, product page, categories, universities, campuses.
 * See {@code UniMarket-Backend/docs/PRODUCTS_API.md}.
 */
@RestController
@Profile("!nodb")
public class CatalogController {

    static final int MAX_PAGE_SIZE = 50;
    static final int DEFAULT_PAGE_SIZE = 20;

    private final CatalogService catalog;
    private final ReferenceDataService referenceData;

    public CatalogController(CatalogService catalog, ReferenceDataService referenceData) {
        this.catalog = catalog;
        this.referenceData = referenceData;
    }

    /**
     * Catalog: public available listings only.
     * Query: {@code q, categoryId, condition (repeatable or comma separated), campusId, universityId, sellerId,
     * minPrice, maxPrice, featured, deals, sort (newest|price_asc|price_desc), page (1-based), size (1-50), zoneId, province}.
     * {@code zoneId} / {@code province} (V003) filter by the listing's effective demo pickup area.
     */
    @GetMapping("/api/products")
    public PageResponse<ProductSummaryResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer categoryId,
            @RequestParam(name = "condition", required = false) List<String> condition,
            @RequestParam(required = false) Integer campusId,
            @RequestParam(required = false) Integer universityId,
            @RequestParam(required = false) Integer sellerId,
            @RequestParam(required = false) Long minPrice,
            @RequestParam(required = false) Long maxPrice,
            @RequestParam(defaultValue = "false") boolean featured,
            @RequestParam(defaultValue = "false") boolean deals,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) int size,
            @RequestParam(required = false) Integer zoneId,
            @RequestParam(required = false) String province) {
        List<ApiErrorResponse.FieldError> errors = new ArrayList<>();
        if (q != null && q.length() > 100) errors.add(new ApiErrorResponse.FieldError("q", "must be at most 100 characters"));
        if (province != null && province.length() > 100) errors.add(new ApiErrorResponse.FieldError("province", "must be at most 100 characters"));
        if (zoneId != null && zoneId < 1) errors.add(new ApiErrorResponse.FieldError("zoneId", "must be 1 or more"));
        if (page < 1) errors.add(new ApiErrorResponse.FieldError("page", "must be 1 or more"));
        if (size < 1 || size > MAX_PAGE_SIZE) errors.add(new ApiErrorResponse.FieldError("size", "must be between 1 and " + MAX_PAGE_SIZE));
        if (minPrice != null && minPrice < 0) errors.add(new ApiErrorResponse.FieldError("minPrice", "must be 0 or more"));
        if (maxPrice != null && maxPrice < 0) errors.add(new ApiErrorResponse.FieldError("maxPrice", "must be 0 or more"));
        if (minPrice != null && maxPrice != null && minPrice > maxPrice) errors.add(new ApiErrorResponse.FieldError("minPrice", "must not exceed maxPrice"));
        List<ProductCondition> conditions = List.of();
        try {
            conditions = CatalogService.parseConditions(condition);
        } catch (IllegalArgumentException ex) {
            errors.add(new ApiErrorResponse.FieldError("condition", "must be NEW, LIKE_NEW or USED"));
        }
        CatalogQuery.CatalogSort sortOrder = CatalogQuery.CatalogSort.NEWEST;
        try {
            sortOrder = CatalogQuery.CatalogSort.fromParameter(sort);
        } catch (IllegalArgumentException ex) {
            errors.add(new ApiErrorResponse.FieldError("sort", "must be newest, price_asc or price_desc"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return catalog.list(new CatalogQuery(q, categoryId, conditions, campusId, universityId, sellerId, minPrice, maxPrice,
                featured, deals, sortOrder, page, size, zoneId, province == null || province.isBlank() ? null : province.trim()));
    }

    /** Several public listings by id, in the requested order (cart, checkout); unknown or hidden ids are left out. */
    @GetMapping("/api/products/by-ids")
    public List<ProductSummaryResponse> byIds(@RequestParam List<Integer> ids) {
        if (ids.isEmpty() || ids.size() > MAX_PAGE_SIZE) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("ids", "must contain 1 to " + MAX_PAGE_SIZE + " ids")));
        }
        return catalog.byIds(ids);
    }

    /** Product page. Public; a token (optional) lets the seller or an admin see a non-public listing. */
    @GetMapping("/api/products/{id}")
    public ProductDetailResponse detail(@PathVariable int id) {
        return catalog.detail(id, CurrentUser.optional().orElse(null));
    }

    /** Active categories with the number of available listings. */
    @GetMapping("/api/categories")
    public List<ReferenceDataResponses.CategoryResponse> categories() {
        return referenceData.categories();
    }

    /** Universities with their campuses. */
    @GetMapping("/api/universities")
    public List<ReferenceDataResponses.UniversityResponse> universities() {
        return referenceData.universities();
    }

    /**
     * V003 demo pickup / delivery areas (approximate zones for simulated shipping, not addresses). Public.
     */
    @GetMapping("/api/locations/zones")
    public List<ReferenceDtos.ZoneRef> zones() {
        return referenceData.zones();
    }

    /** Campuses, optionally of one university. */
    @GetMapping("/api/campuses")
    public List<ReferenceDtos.CampusRef> campuses(@RequestParam(required = false) Integer universityId) {
        return referenceData.campuses(universityId);
    }
}
