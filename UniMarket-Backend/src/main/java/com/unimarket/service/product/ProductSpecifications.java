package com.unimarket.service.product;

import com.unimarket.entity.Campus;
import com.unimarket.entity.LocationZone;
import com.unimarket.entity.ModerationStatus;
import com.unimarket.entity.Product;
import com.unimarket.entity.ProductCondition;
import com.unimarket.entity.ProductStatus;
import com.unimarket.entity.UserStatus;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.util.Collection;

/**
 * Catalog filters built with the JPA Criteria API: every user value is a bound parameter, never
 * concatenated into SQL.
 */
public final class ProductSpecifications {

    /** Escape character used in LIKE patterns. */
    public static final char LIKE_ESCAPE = '\\';

    private ProductSpecifications() {
    }

    /**
     * What buyers may browse and order: Available, approved, active seller, active category
     * (same rule as {@code dbo.vw_ProductCatalog}).
     */
    public static Specification<Product> publicAvailable() {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("status"), ProductStatus.AVAILABLE),
                cb.equal(root.get("moderationStatus"), ModerationStatus.APPROVED),
                cb.equal(root.get("seller").get("status"), UserStatus.ACTIVE),
                cb.isTrue(root.get("category").get("active")));
    }

    /** Listings anyone may see on a product page: approved and Available, Reserved or Sold (Stage 3 rule). */
    public static Specification<Product> publiclyVisible() {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("moderationStatus"), ModerationStatus.APPROVED),
                root.get("status").in(ProductStatus.PUBLICLY_VISIBLE));
    }

    /** Keyword in the title (case-insensitive collation; %, _ and [ are escaped). */
    public static Specification<Product> titleContains(String likePattern) {
        return likePattern == null ? null : (root, query, cb) -> cb.like(root.get("title"), likePattern, LIKE_ESCAPE);
    }

    public static Specification<Product> inCategory(Integer categoryId) {
        return categoryId == null ? null : (root, query, cb) -> cb.equal(root.get("category").get("id"), categoryId);
    }

    public static Specification<Product> withConditions(Collection<ProductCondition> conditions) {
        return conditions == null || conditions.isEmpty() ? null : (root, query, cb) -> root.get("condition").in(conditions);
    }

    /**
     * V003: listings whose effective pickup area is this zone: the explicit {@code Products.PickupZoneId}, else the
     * zone of the listing's campus (same rule as {@link Product#getEffectivePickupZone()}).
     */
    public static Specification<Product> inPickupZone(Integer zoneId) {
        return zoneId == null ? null : (root, query, cb) -> {
            EffectiveZone zone = effectiveZone(root);
            return cb.or(cb.equal(zone.explicit().get("id"), zoneId),
                    cb.and(cb.isNull(zone.explicit().get("id")), cb.equal(zone.campus().get("id"), zoneId)));
        };
    }

    /** V003: listings whose effective pickup area lies in this province / city ({@code LocationZones.Province}). */
    public static Specification<Product> inProvince(String province) {
        return province == null || province.isBlank() ? null : (root, query, cb) -> {
            EffectiveZone zone = effectiveZone(root);
            String value = province.trim();
            return cb.or(cb.equal(zone.explicit().get("province"), value),
                    cb.and(cb.isNull(zone.explicit().get("id")), cb.equal(zone.campus().get("province"), value)));
        };
    }

    private record EffectiveZone(Path<LocationZone> explicit, Path<LocationZone> campus) {
    }

    /** Left joins: a listing may have no explicit zone, and (V003) no campus. Many-to-one joins never add rows. */
    private static EffectiveZone effectiveZone(Root<Product> root) {
        Join<Product, LocationZone> explicit = root.join("pickupZone", JoinType.LEFT);
        Join<Product, Campus> campus = root.join("campus", JoinType.LEFT);
        return new EffectiveZone(explicit, campus.join("zone", JoinType.LEFT));
    }

    public static Specification<Product> atCampus(Integer campusId) {
        return campusId == null ? null : (root, query, cb) -> cb.equal(root.get("campus").get("id"), campusId);
    }

    public static Specification<Product> bySeller(Integer sellerId) {
        return sellerId == null ? null : (root, query, cb) -> cb.equal(root.get("seller").get("id"), sellerId);
    }

    public static Specification<Product> atUniversity(Integer universityId) {
        return universityId == null ? null : (root, query, cb) -> cb.equal(root.get("campus").get("university").get("id"), universityId);
    }

    public static Specification<Product> priceAtLeast(Long min) {
        return min == null ? null : (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("price"), BigDecimal.valueOf(min));
    }

    public static Specification<Product> priceAtMost(Long max) {
        return max == null ? null : (root, query, cb) -> cb.lessThanOrEqualTo(root.get("price"), BigDecimal.valueOf(max));
    }

    public static Specification<Product> idIn(Collection<Integer> ids) {
        return (root, query, cb) -> ids.isEmpty() ? cb.disjunction() : root.get("id").in(ids);
    }

    /**
     * "Student deals" (existing frontend page): a reference original price exists and the price is at least
     * {@code minSavingsPercent} % below it. Without an original price there is no deal.
     */
    public static Specification<Product> dealsOf(int minSavingsPercent) {
        BigDecimal factor = BigDecimal.valueOf(100 - minSavingsPercent).movePointLeft(2);
        return (root, query, cb) -> cb.and(
                cb.isNotNull(root.get("originalPrice")),
                cb.le(root.get("price"), cb.prod(root.get("originalPrice"), factor)));
    }

    /**
     * @param keyword raw search text (may be null / blank)
     * @return a LIKE pattern {@code %keyword%} with special characters escaped, or null
     */
    public static String likePattern(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        String escaped = keyword.trim()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
                .replace("[", "\\[");
        return "%" + escaped + "%";
    }
}
