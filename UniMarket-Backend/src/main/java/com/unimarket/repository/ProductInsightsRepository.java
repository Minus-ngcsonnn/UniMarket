package com.unimarket.repository;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Read-only facts that come from other tables and views, loaded once per page (no N+1):
 * featured listings ({@code ProductPromotions}, same rule as {@code vw_ProductCatalog.IsFeatured}),
 * seller ratings ({@code vw_UserRatings}), active-order membership ({@code vw_ActiveOrderItems})
 * and catalog facet counts. All queries use bound parameters.
 */
@Repository
@Profile("!nodb")
public class ProductInsightsRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ProductInsightsRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** @return ids among {@code productIds} with a paid promotion running now */
    public Set<Integer> featuredAmong(Collection<Integer> productIds) {
        if (productIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.queryForList(
                "SELECT DISTINCT ProductId FROM dbo.ProductPromotions WHERE ProductId IN (:ids) AND Status = 'Paid' "
                        + "AND StartsAt <= SYSUTCDATETIME() AND EndsAt > SYSUTCDATETIME()",
                new MapSqlParameterSource("ids", productIds), Integer.class));
    }

    /** @return SQL that selects ids of listings with a paid promotion running now (for the "featured" filter) */
    public static String featuredProductIdsSql() {
        return "SELECT ProductId FROM dbo.ProductPromotions WHERE Status = 'Paid' AND StartsAt <= SYSUTCDATETIME() AND EndsAt > SYSUTCDATETIME()";
    }

    /** @return seller id → rating, for sellers that have visible reviews */
    public Map<Integer, Rating> ratingsOf(Collection<Integer> sellerIds) {
        Map<Integer, Rating> ratings = new HashMap<>();
        if (sellerIds.isEmpty()) {
            return ratings;
        }
        jdbc.query("SELECT UserId, ReviewCount, AverageRating FROM dbo.vw_UserRatings WHERE UserId IN (:ids)",
                new MapSqlParameterSource("ids", sellerIds),
                rs -> { ratings.put(rs.getInt("UserId"), new Rating(rs.getBigDecimal("AverageRating"), rs.getInt("ReviewCount"))); });
        return ratings;
    }

    /** @return true when the listing is in a non-cancelled order */
    public boolean isInActiveOrder(int productId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ActiveOrderItems WHERE ProductId = :id",
                new MapSqlParameterSource("id", productId), Integer.class);
        return count != null && count > 0;
    }

    /** @return number of public, available listings per active category */
    public Map<Integer, Long> availableCountByCategory() {
        Map<Integer, Long> counts = new HashMap<>();
        jdbc.query("SELECT CategoryId, COUNT(*) AS n FROM dbo.vw_ProductCatalog GROUP BY CategoryId", Map.of(),
                rs -> { counts.put(rs.getInt("CategoryId"), rs.getLong("n")); });
        return counts;
    }

    /**
     * Facet counts for the catalog, over the public available listings that match the keyword only
     * (like the frontend mock): per condition, category and campus.
     *
     * @param likePattern escaped LIKE pattern for the title, or null for no keyword
     */
    public Facets facets(String likePattern) {
        MapSqlParameterSource params = new MapSqlParameterSource("q", likePattern);
        String where = likePattern == null ? "" : " WHERE Title LIKE :q ESCAPE '\\'";
        return new Facets(
                count("SELECT Condition AS k, COUNT(*) AS n FROM dbo.vw_ProductCatalog" + where + " GROUP BY Condition", params),
                count("SELECT CAST(CategoryId AS nvarchar(20)) AS k, COUNT(*) AS n FROM dbo.vw_ProductCatalog" + where + " GROUP BY CategoryId", params),
                count("SELECT CAST(CampusId AS nvarchar(20)) AS k, COUNT(*) AS n FROM dbo.vw_ProductCatalog" + where + " GROUP BY CampusId", params));
    }

    private Map<String, Long> count(String sql, MapSqlParameterSource params) {
        Map<String, Long> counts = new HashMap<>();
        jdbc.query(sql, params, rs -> { counts.put(rs.getString("k"), rs.getLong("n")); });
        return counts;
    }

    /**
     * @param average average stars (1-5, two decimals)
     * @param count   number of visible reviews
     */
    public record Rating(BigDecimal average, int count) {
    }

    /** Raw facet counts keyed by database value (condition text) or id (category, campus). */
    public record Facets(Map<String, Long> conditions, Map<String, Long> categories, Map<String, Long> campuses) {
    }
}
