package com.unimarket.service.product;

import com.unimarket.common.ErrorCode;
import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.dto.product.ReferenceDataResponses;
import com.unimarket.entity.Favorite;
import com.unimarket.entity.Product;
import com.unimarket.exception.ApiException;
import com.unimarket.repository.FavoriteRepository;
import com.unimarket.repository.ProductRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * "Saved items" stored in {@code dbo.Favorites} (replaces the browser-only list of the frontend).
 * Every operation is scoped to the user id from the token, so nobody can read or change another
 * user's favorites. The primary key (UserId, ProductId) prevents duplicates.
 */
@Service
@Profile("!nodb")
public class FavoriteService {

    private final FavoriteRepository favorites;
    private final ProductRepository products;
    private final ProductMapper mapper;
    private final Clock clock;

    public FavoriteService(FavoriteRepository favorites, ProductRepository products, ProductMapper mapper, Clock clock) {
        this.favorites = favorites;
        this.products = products;
        this.mapper = mapper;
        this.clock = clock;
    }

    /**
     * Saves a listing. Idempotent: saving it again creates nothing. Only listings buyers can see
     * (approved, Available / Reserved / Sold) can be saved; others are 404.
     */
    @Transactional
    public ReferenceDataResponses.FavoriteResponse add(int userId, int productId) {
        Product product = products.findById(productId).filter(Product::isPubliclyVisible)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
        if (favorites.existsById(new Favorite.Key(userId, productId))) {
            return new ReferenceDataResponses.FavoriteResponse(product.getId(), true, false);
        }
        try {
            favorites.saveAndFlush(new Favorite(userId, productId, LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS)));
        } catch (DataIntegrityViolationException ex) {   // saved twice at the same moment: the primary key wins
            return new ReferenceDataResponses.FavoriteResponse(product.getId(), true, false);
        }
        return new ReferenceDataResponses.FavoriteResponse(product.getId(), true, true);
    }

    /** Removes a saved listing. Idempotent: removing something not saved is not an error. */
    @Transactional
    public void remove(int userId, int productId) {
        favorites.deleteById(new Favorite.Key(userId, productId));
    }

    /**
     * The user's saved listings, newest first. Listings that are no longer visible (removed, blocked,
     * back in moderation) are left out but their rows are kept; Reserved and Sold ones are shown with their
     * status and {@code purchasable = false}. An empty list means nothing is saved.
     */
    @Transactional(readOnly = true)
    public List<ProductSummaryResponse> list(int userId) {
        List<Product> visible = favorites.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(Favorite::getProduct)
                .filter(Product::isPubliclyVisible)
                .toList();
        return mapper.toSummaries(visible, false);
    }
}
