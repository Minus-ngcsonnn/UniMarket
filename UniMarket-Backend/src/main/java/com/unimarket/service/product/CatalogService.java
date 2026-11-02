package com.unimarket.service.product;

import com.unimarket.common.ErrorCode;
import com.unimarket.dto.product.PageResponse;
import com.unimarket.dto.product.ProductDetailResponse;
import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.entity.Product;
import com.unimarket.entity.ProductCondition;
import com.unimarket.entity.UserRole;
import com.unimarket.exception.ApiException;
import com.unimarket.repository.ProductInsightsRepository;
import com.unimarket.repository.ProductRepository;
import com.unimarket.security.AuthenticatedUser;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Public catalog (Business Plan 3.4 steps 2–3, 6.3 "Search and Filter" / "Product Details", 6.5 "Product
 * Search Process": the system returns matching AVAILABLE products).
 */
@Service
@Profile("!nodb")
public class CatalogService {

    /** Frontend "Student deals": at least this % below the original price (constants/product.js DEAL_MIN_SAVINGS). */
    static final int DEAL_MIN_SAVINGS_PERCENT = 40;

    private final ProductRepository products;
    private final ProductInsightsRepository insights;
    private final ProductMapper mapper;
    private final JdbcTemplate jdbc;

    public CatalogService(ProductRepository products, ProductInsightsRepository insights, ProductMapper mapper, JdbcTemplate jdbc) {
        this.products = products;
        this.insights = insights;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    /**
     * Lists public, available listings. Reserved, sold, removed, draft, pending and blocked listings never
     * appear here.
     *
     * @param query validated filters, sort and page
     * @return the page, with facet counts for the keyword
     */
    @Transactional(readOnly = true)
    public PageResponse<ProductSummaryResponse> list(CatalogQuery query) {
        String pattern = ProductSpecifications.likePattern(query.q());
        Specification<Product> spec = Specification.allOf(
                ProductSpecifications.publicAvailable(),
                ProductSpecifications.titleContains(pattern),
                ProductSpecifications.inCategory(query.categoryId()),
                ProductSpecifications.withConditions(query.conditions()),
                ProductSpecifications.atCampus(query.campusId()),
                ProductSpecifications.atUniversity(query.universityId()),
                ProductSpecifications.bySeller(query.sellerId()),
                ProductSpecifications.priceAtLeast(query.minPrice()),
                ProductSpecifications.priceAtMost(query.maxPrice()),
                query.featured() ? ProductSpecifications.idIn(featuredIds()) : null,
                query.deals() ? ProductSpecifications.dealsOf(DEAL_MIN_SAVINGS_PERCENT) : null);
        Page<Product> page = products.findAll(spec, PageRequest.of(query.page() - 1, query.size(), sortOf(query.sort())));
        ProductInsightsRepository.Facets facets = insights.facets(pattern);
        return new PageResponse<>(mapper.toSummaries(page.getContent(), false), query.page(), query.size(),
                page.getTotalElements(), page.getTotalPages(),
                new PageResponse.Facets(conditionFacets(facets.conditions()), facets.categories(), facets.campuses()));
    }

    /**
     * Product page. Public for approved Available / Reserved / Sold listings (Reserved and Sold are shown
     * with their status and {@code purchasable = false}). Draft, removed, pending or blocked listings are
     * visible only to their seller or an admin; everyone else gets 404.
     *
     * @param id     listing id
     * @param viewer signed-in user, or null for a visitor
     */
    @Transactional(readOnly = true)
    public ProductDetailResponse detail(int id, AuthenticatedUser viewer) {
        Product product = products.findWithDetailsById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
        boolean ownerView = viewer != null && (viewer.role() == UserRole.ADMIN || viewer.id().equals(product.getSeller().getId()));
        if (!product.isPubliclyVisible() && !ownerView) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Listing not found.");
        }
        return mapper.toDetail(product, ownerView);
    }

    private Set<Integer> featuredIds() {
        return new HashSet<>(jdbc.queryForList(ProductInsightsRepository.featuredProductIdsSql(), Integer.class));
    }

    private static Sort sortOf(CatalogQuery.CatalogSort sort) {
        return switch (sort) {
            case NEWEST -> Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
            case PRICE_ASC -> Sort.by(Sort.Order.asc("price"), Sort.Order.desc("id"));
            case PRICE_DESC -> Sort.by(Sort.Order.desc("price"), Sort.Order.desc("id"));
        };
    }

    /** {@code 'Like New'} → {@code LIKE_NEW}; every condition is present (0 when none). */
    private static Map<String, Long> conditionFacets(Map<String, Long> raw) {
        Map<String, Long> result = new LinkedHashMap<>();
        Arrays.stream(ProductCondition.values()).forEach(c -> result.put(c.name(), raw.getOrDefault(c.databaseValue(), 0L)));
        return result;
    }

    /** @return the conditions named in a request, e.g. {@code NEW,LIKE_NEW} */
    public static List<ProductCondition> parseConditions(List<String> values) {
        return values == null ? List.of() : values.stream()
                .flatMap(v -> Arrays.stream(v.split(",")))
                .map(String::trim).filter(v -> !v.isEmpty())
                .map(v -> ProductCondition.valueOf(v.toUpperCase(java.util.Locale.ROOT)))
                .distinct().toList();
    }
}
