package com.unimarket.service.review;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.review.ReviewDtos;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.SqlErrors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reviews (D5; Business Plan 3.4 step 8, 6.3 "Rating and Review", 6.5 "Review Process").
 *
 * <ul>
 *   <li>Only after the order is Completed, only between its buyer and its seller, one review per direction per order
 *       ({@code trg_Reviews_Validate}, {@code UNIQUE (OrderId, ReviewerId)}, {@code CHECK Rating 1–5},
 *       {@code CHECK ReviewerId <> RevieweeId}).</li>
 *   <li>The reviewer is the signed-in user and the reviewee is derived from the order: never taken from the request.</li>
 *   <li>No editing or deleting of reviews (no approved policy); hidden reviews ({@code IsHidden}) are excluded from
 *       ratings and public lists.</li>
 * </ul>
 */
@Service
@Profile("!nodb")
public class ReviewService {

    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);

    private final NamedParameterJdbcTemplate jdbc;

    public ReviewService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The viewer reviews the other participant of a completed order. */
    public ReviewDtos.Review submit(long orderId, int rating, String comment, AuthenticatedUser viewer) {
        Map<String, Object> order = participantOrder(orderId, viewer);
        if (!"Completed".equals(order.get("Status"))) {
            throw new ApiException(ErrorCode.REVIEW_NOT_ALLOWED);
        }
        int buyer = ((Number) order.get("BuyerId")).intValue();
        int seller = ((Number) order.get("SellerId")).intValue();
        int reviewee = viewer.id() == buyer ? seller : buyer;
        String text = comment == null || comment.isBlank() ? null : comment.trim();
        if (rating < 1 || rating > 5) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("rating", "must be between 1 and 5")));
        }
        long id;
        try {
            // No OUTPUT clause: dbo.Reviews has a trigger (trg_Reviews_Validate); the id comes from the generated key.
            org.springframework.jdbc.support.GeneratedKeyHolder keys = new org.springframework.jdbc.support.GeneratedKeyHolder();
            jdbc.update("INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating, Comment) VALUES (:order, :reviewer, :reviewee, :rating, :comment)",
                    new MapSqlParameterSource("order", orderId).addValue("reviewer", viewer.id()).addValue("reviewee", reviewee)
                            .addValue("rating", rating).addValue("comment", text, Types.NVARCHAR), keys, new String[]{"ReviewId"});
            id = java.util.Objects.requireNonNull(keys.getKey()).longValue();
        } catch (DataAccessException ex) {
            if (SqlErrors.isDuplicateKey(ex)) {
                throw new ApiException(ErrorCode.ALREADY_REVIEWED);
            }
            if (SqlErrors.numberOf(ex) == 51001) {
                throw new ApiException(ErrorCode.REVIEW_NOT_ALLOWED);
            }
            throw ex;
        }
        log.info("Review {} on order {} by user {}", id, orderId, viewer.id());
        return one(id);
    }

    /** Both reviews of an order for one of its participants (404 for anyone else). */
    public ReviewDtos.OrderReviews forOrder(long orderId, AuthenticatedUser viewer) {
        Map<String, Object> order = participantOrder(orderId, viewer);
        List<ReviewDtos.Review> reviews = jdbc.query(REVIEW_SQL + " WHERE r.OrderId = :order", Map.of("order", orderId), ReviewService::review);
        ReviewDtos.Review mine = reviews.stream().filter(r -> r.reviewer().id() == viewer.id()).findFirst().orElse(null);
        ReviewDtos.Review theirs = reviews.stream().filter(r -> r.reviewer().id() != viewer.id()).findFirst().orElse(null);
        return new ReviewDtos.OrderReviews("Completed".equals(order.get("Status")) && mine == null, mine, theirs);
    }

    /** Public rating summary of an active user (404 otherwise). */
    public ReviewDtos.RatingSummary rating(int userId) {
        requirePublicUser(userId);
        return summary(userId);
    }

    /**
     * Visible reviews received by an active user, newest first.
     *
     * @param role SELLER (reviews written by buyers), BUYER (written by sellers) or null for both
     */
    public ReviewDtos.ReviewPage received(int userId, String role, int page, int size) {
        requirePublicUser(userId);
        if (page < 1 || size < 1 || size > 50) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("page", "page must be 1 or more and size 1 to 50")));
        }
        String key = role == null || role.isBlank() ? null : role.trim().toUpperCase(Locale.ROOT);
        if (key != null && !key.equals("SELLER") && !key.equals("BUYER")) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("role", "must be SELLER or BUYER")));
        }
        MapSqlParameterSource params = new MapSqlParameterSource("user", userId).addValue("role", key, Types.VARCHAR)
                .addValue("offset", (page - 1) * size).addValue("limit", size);
        String where = " WHERE r.RevieweeId = :user AND r.IsHidden = 0 AND (:role IS NULL OR (:role = 'SELLER' AND o.SellerId = :user)"
                + " OR (:role = 'BUYER' AND o.BuyerId = :user))";
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Reviews r JOIN dbo.Orders o ON o.OrderId = r.OrderId" + where, params, Long.class);
        List<ReviewDtos.Review> items = jdbc.query(REVIEW_SQL + where + " ORDER BY r.CreatedAt DESC, r.ReviewId DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY",
                params, ReviewService::review);
        long count = total == null ? 0 : total;
        return new ReviewDtos.ReviewPage(items, page, size, count, (int) ((count + size - 1) / size));
    }

    /** Public profile with rating; contact only when the user shares it (same rule as the product page). */
    public ReviewDtos.PublicProfile profile(int userId) {
        return jdbc.query("""
                SELECT pp.UserId, pp.FullName, pp.AvatarUrl, u.CampusId, c.Name AS CampusName, un.Name AS UniversityName,
                       u.DeclaredUniversityName, pp.EmailVerifiedAt, pp.Phone, pp.ZaloUrl,
                       u.CreatedAt,
                       (SELECT COUNT(*) FROM dbo.vw_ProductCatalog p WHERE p.SellerId = pp.UserId) AS ActiveListings
                FROM dbo.vw_PublicProfiles pp JOIN dbo.Users u ON u.UserId = pp.UserId
                LEFT JOIN dbo.Campuses c ON c.CampusId = u.CampusId LEFT JOIN dbo.Universities un ON un.UniversityId = c.UniversityId
                WHERE pp.UserId = :id AND u.Role = 'Student'""", Map.of("id", userId), (rs, i) -> new ReviewDtos.PublicProfile(
                        rs.getInt("UserId"), rs.getString("FullName"), rs.getString("AvatarUrl"), (Integer) rs.getObject("CampusId"),
                        rs.getString("CampusName"),
                        rs.getObject("CampusId") != null ? rs.getString("UniversityName") : rs.getString("DeclaredUniversityName"),
                        rs.getObject("CampusId") != null ? "OFFICIAL_CAMPUS" : "SELF_DECLARED",
                        rs.getObject("EmailVerifiedAt") != null, utc(rs, "CreatedAt"), summary(userId),
                        rs.getString("Phone") == null && rs.getString("ZaloUrl") == null ? null
                                : new ReviewDtos.Contact(rs.getString("Phone"), rs.getString("ZaloUrl")),
                        rs.getInt("ActiveListings")))
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Account not found."));
    }

    // ------------------------------------------------------------------ helpers

    private ReviewDtos.RatingSummary summary(int userId) {
        Map<String, Integer> distribution = new LinkedHashMap<>();
        for (int stars = 1; stars <= 5; stars++) {
            distribution.put(Integer.toString(stars), 0);
        }
        int[] sides = new int[2];
        jdbc.query("""
                SELECT r.Rating, SUM(CASE WHEN o.SellerId = :user THEN 1 ELSE 0 END) AS AsSeller,
                       SUM(CASE WHEN o.BuyerId = :user THEN 1 ELSE 0 END) AS AsBuyer, COUNT(*) AS N
                FROM dbo.Reviews r JOIN dbo.Orders o ON o.OrderId = r.OrderId
                WHERE r.RevieweeId = :user AND r.IsHidden = 0 GROUP BY r.Rating""", Map.of("user", userId), rs -> {
            distribution.put(Integer.toString(rs.getInt("Rating")), rs.getInt("N"));
            sides[0] += rs.getInt("AsSeller");
            sides[1] += rs.getInt("AsBuyer");
        });
        return jdbc.query("SELECT AverageRating, ReviewCount FROM dbo.vw_UserRatings WHERE UserId = :user", Map.of("user", userId),
                        (rs, i) -> new ReviewDtos.RatingSummary(userId, rs.getBigDecimal("AverageRating"), rs.getInt("ReviewCount"), distribution,
                                sides[0], sides[1]))
                .stream().findFirst().orElse(new ReviewDtos.RatingSummary(userId, null, 0, distribution, 0, 0));
    }

    private Map<String, Object> participantOrder(long orderId, AuthenticatedUser viewer) {
        Map<String, Object> order = jdbc.queryForList("SELECT BuyerId, SellerId, Status FROM dbo.Orders WHERE OrderId = :id", Map.of("id", orderId))
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Order not found."));
        int buyer = ((Number) order.get("BuyerId")).intValue();
        int seller = ((Number) order.get("SellerId")).intValue();
        if (viewer.id() != buyer && viewer.id() != seller) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Order not found.");
        }
        return order;
    }

    private void requirePublicUser(int userId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_PublicProfiles pp JOIN dbo.Users u ON u.UserId = pp.UserId "
                + "WHERE pp.UserId = :id AND u.Role = 'Student'", Map.of("id", userId), Integer.class);
        if (n == null || n == 0) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Account not found.");
        }
    }

    private ReviewDtos.Review one(long id) {
        return jdbc.query(REVIEW_SQL + " WHERE r.ReviewId = :id", Map.of("id", id), ReviewService::review).getFirst();
    }

    private static final String REVIEW_SQL = """
            SELECT r.ReviewId, r.OrderId, r.ReviewerId, rv.FullName AS ReviewerName, r.RevieweeId, re.FullName AS RevieweeName,
                   r.Rating, r.Comment, r.CreatedAt, o.BuyerId
            FROM dbo.Reviews r
            JOIN dbo.Orders o ON o.OrderId = r.OrderId
            JOIN dbo.Users rv ON rv.UserId = r.ReviewerId
            JOIN dbo.Users re ON re.UserId = r.RevieweeId
            """;

    private static ReviewDtos.Review review(ResultSet rs, int rowNum) throws SQLException {
        return new ReviewDtos.Review(rs.getLong("ReviewId"), rs.getLong("OrderId"),
                new ReviewDtos.Person(rs.getInt("ReviewerId"), rs.getString("ReviewerName")),
                new ReviewDtos.Person(rs.getInt("RevieweeId"), rs.getString("RevieweeName")),
                rs.getInt("ReviewerId") == rs.getInt("BuyerId") ? "BUYER_TO_SELLER" : "SELLER_TO_BUYER",
                rs.getInt("Rating"), rs.getString("Comment"), utc(rs, "CreatedAt"));
    }

    private static Instant utc(ResultSet rs, String column) throws SQLException {
        LocalDateTime value = rs.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }
}
