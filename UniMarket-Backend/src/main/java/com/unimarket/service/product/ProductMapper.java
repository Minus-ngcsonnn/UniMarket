package com.unimarket.service.product;

import com.unimarket.dto.product.ProductDetailResponse;
import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.dto.product.ReferenceDtos;
import com.unimarket.entity.ModerationStatus;
import com.unimarket.entity.Product;
import com.unimarket.entity.ProductStatus;
import com.unimarket.entity.User;
import com.unimarket.repository.ProductImageRepository;
import com.unimarket.repository.ProductInsightsRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Builds product DTOs. For lists, main photos and featured flags are loaded once for the whole list
 * (two queries), never per item.
 */
@Component
@Profile("!nodb")
public class ProductMapper {

    private final ProductImageRepository images;
    private final ProductInsightsRepository insights;

    public ProductMapper(ProductImageRepository images, ProductInsightsRepository insights) {
        this.images = images;
        this.insights = insights;
    }

    /**
     * @param products  listings with category, campus, university and seller already loaded
     * @param ownerView true for the seller's own views (adds moderation and editable)
     */
    public List<ProductSummaryResponse> toSummaries(List<Product> products, boolean ownerView) {
        if (products.isEmpty()) {
            return List.of();
        }
        List<Integer> ids = products.stream().map(Product::getId).toList();
        Map<Integer, String> mainImages = images.findMainImages(ids).stream()
                .collect(Collectors.toMap(image -> image.getProduct().getId(), image -> publicUrl(image.getImageUrl()), (a, b) -> a));
        Set<Integer> featured = insights.featuredAmong(ids);
        return products.stream().map(product -> new ProductSummaryResponse(
                product.getId(), product.getTitle(), toLong(product.getPrice()), toLong(product.getOriginalPrice()),
                product.getCondition().name(), product.getStatus().name(), isPurchasable(product),
                ReferenceDtos.CategoryRef.from(product.getCategory()), ReferenceDtos.CampusRef.from(product.getCampus()),
                mainImages.get(product.getId()),
                new ProductSummaryResponse.SellerRef(product.getSeller().getId(), product.getSeller().getFullName()),
                featured.contains(product.getId()), toInstant(product.getCreatedAt()),
                ownerView ? product.getModerationStatus().apiValue() : null,
                ownerView ? ProductStatus.EDITABLE.contains(product.getStatus()) : null)).toList();
    }

    /**
     * @param product   listing with references and photos loaded
     * @param ownerView true for the seller or an admin
     */
    public ProductDetailResponse toDetail(Product product, boolean ownerView) {
        User seller = product.getSeller();
        ProductInsightsRepository.Rating rating = insights.ratingsOf(List.of(seller.getId())).get(seller.getId());
        boolean featured = insights.featuredAmong(List.of(product.getId())).contains(product.getId());
        List<ProductDetailResponse.ImageResponse> photos = product.getImages().stream()
                .map(image -> new ProductDetailResponse.ImageResponse(image.getId(), publicUrl(image.getImageUrl()), image.getSortOrder()))
                .toList();
        ProductDetailResponse.SellerProfile sellerProfile = new ProductDetailResponse.SellerProfile(
                seller.getId(), seller.getFullName(), seller.getEmailVerifiedAt() != null,
                ReferenceDtos.CampusRef.from(seller.getCampus()), toInstant(seller.getCreatedAt()),
                rating == null ? null : rating.average(), rating == null ? 0 : rating.count(),
                ProductDetailResponse.Contact.of(seller.isShowContact(), seller.getPhone(), seller.getZaloUrl()));
        return new ProductDetailResponse(product.getId(), product.getTitle(), product.getDescription(), toLong(product.getPrice()),
                toLong(product.getOriginalPrice()), product.getCondition().name(), product.getStatus().name(), isPurchasable(product),
                ReferenceDtos.CategoryRef.from(product.getCategory()), ReferenceDtos.CampusRef.from(product.getCampus()), photos,
                sellerProfile, featured, toInstant(product.getCreatedAt()), toInstant(product.getUpdatedAt()),
                ownerView ? product.getModerationStatus().apiValue() : null,
                ownerView ? ProductStatus.EDITABLE.contains(product.getStatus()) : null);
    }

    /**
     * Makes a stored photo reference usable from any page: the demo rows hold relative paths such as
     * {@code images/demo/products/item-01-detail.svg}, which a browser would resolve against the current
     * page (e.g. {@code /product/12/images/...}). They are returned root-relative ({@code /images/...}),
     * pointing at the frontend's static folder. The database value is not changed. Absolute URLs and
     * {@code /media/...} uploads are returned as they are.
     */
    public static String publicUrl(String reference) {
        if (reference == null || reference.isBlank() || reference.startsWith("/") || reference.contains("://")) {
            return reference;
        }
        return "/" + reference;
    }

    /** Orderable now: Available and approved (Reserved / Sold are never purchasable). */
    public static boolean isPurchasable(Product product) {
        return product.getStatus() == ProductStatus.AVAILABLE && product.getModerationStatus() == ModerationStatus.APPROVED;
    }

    /** Indexes listings by id (helper for callers that keep their own order). */
    public static Map<Integer, Product> byId(Collection<Product> products) {
        return products.stream().collect(Collectors.toMap(Product::getId, Function.identity()));
    }

    private static Long toLong(BigDecimal value) {
        return value == null ? null : value.longValueExact();
    }

    private static Instant toInstant(LocalDateTime utc) {
        return utc == null ? null : utc.toInstant(ZoneOffset.UTC);
    }
}
