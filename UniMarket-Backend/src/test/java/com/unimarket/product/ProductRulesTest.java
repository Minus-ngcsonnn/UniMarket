package com.unimarket.product;

import com.unimarket.dto.product.ListingRequest;
import com.unimarket.dto.product.ReferenceDtos;
import com.unimarket.entity.ModerationStatus;
import com.unimarket.entity.ProductCondition;
import com.unimarket.entity.ProductStatus;
import com.unimarket.service.product.CatalogQuery;
import com.unimarket.service.product.CatalogService;
import com.unimarket.service.product.ProductSpecifications;
import com.unimarket.service.storage.ImageType;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pure unit tests (no Spring, no database) for the Stage 3 rules. */
class ProductRulesTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    // ---------------------------------------------------------------- photo type detection

    @Test
    void photoTypeIsDetectedFromTheBytes() {
        assertThat(ImageType.detect(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0, 0, 0, 0, 0}))
                .contains(ImageType.JPEG);
        assertThat(ImageType.detect(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0})).contains(ImageType.PNG);
        assertThat(ImageType.detect(new byte[]{'R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B', 'P'})).contains(ImageType.WEBP);
    }

    @Test
    void otherContentIsNotAPhoto() {
        assertThat(ImageType.detect("GIF89a......".getBytes())).isEmpty();
        assertThat(ImageType.detect("<svg xmlns=".getBytes())).isEmpty();
        assertThat(ImageType.detect(new byte[]{'R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'A', 'V', 'E'})).isEmpty();
        assertThat(ImageType.detect("<html><script>".getBytes())).isEmpty();
        assertThat(ImageType.detect(new byte[]{(byte) 0xFF, (byte) 0xD8})).isEmpty();
        assertThat(ImageType.detect(new byte[0])).isEmpty();
        assertThat(ImageType.detect(null)).isEqualTo(Optional.empty());
    }

    // ---------------------------------------------------------------- search and reference data

    @Test
    void searchTextIsEscapedForLike() {
        assertThat(ProductSpecifications.likePattern("  laptop ")).isEqualTo("%laptop%");
        assertThat(ProductSpecifications.likePattern("50%_[x]\\")).isEqualTo("%50\\%\\_\\[x]\\\\%");
        assertThat(ProductSpecifications.likePattern("   ")).isNull();
        assertThat(ProductSpecifications.likePattern(null)).isNull();
    }

    @Test
    void categorySlugsAreDerivedFromNames() {
        assertThat(ReferenceDtos.slugOf("Bikes & Ride")).isEqualTo("bikes-and-ride");
        assertThat(ReferenceDtos.slugOf("Dormitory items")).isEqualTo("dormitory-items");
        assertThat(ReferenceDtos.slugOf("Đồ dùng học tập")).isEqualTo("do-dung-hoc-tap");
        assertThat(ReferenceDtos.slugOf("  Textbooks  ")).isEqualTo("textbooks");
    }

    @Test
    void photoReferencesAreReturnedRootRelative() {
        assertThat(com.unimarket.service.product.ProductMapper.publicUrl("images/demo/products/item-01-detail.svg"))
                .isEqualTo("/images/demo/products/item-01-detail.svg");
        assertThat(com.unimarket.service.product.ProductMapper.publicUrl("/media/products/abc.png")).isEqualTo("/media/products/abc.png");
        assertThat(com.unimarket.service.product.ProductMapper.publicUrl("https://cdn.example/x.jpg")).isEqualTo("https://cdn.example/x.jpg");
        assertThat(com.unimarket.service.product.ProductMapper.publicUrl(null)).isNull();
    }

    @Test
    void catalogParametersAreWhitelisted() {
        assertThat(CatalogQuery.CatalogSort.fromParameter(null)).isEqualTo(CatalogQuery.CatalogSort.NEWEST);
        assertThat(CatalogQuery.CatalogSort.fromParameter("price_asc")).isEqualTo(CatalogQuery.CatalogSort.PRICE_ASC);
        assertThatThrownBy(() -> CatalogQuery.CatalogSort.fromParameter("Price; DROP TABLE")).isInstanceOf(IllegalArgumentException.class);
        assertThat(CatalogService.parseConditions(List.of("new,like_new", "NEW"))).containsExactly(ProductCondition.NEW, ProductCondition.LIKE_NEW);
        assertThatThrownBy(() -> CatalogService.parseConditions(List.of("Mint"))).isInstanceOf(IllegalArgumentException.class);
    }

    // ---------------------------------------------------------------- status rules and DB values

    @Test
    void statusRulesMatchTheDatabaseValues() {
        assertThat(ProductStatus.EDITABLE).containsExactlyInAnyOrder(ProductStatus.DRAFT, ProductStatus.AVAILABLE);
        assertThat(ProductStatus.PUBLICLY_VISIBLE).doesNotContain(ProductStatus.DRAFT, ProductStatus.REMOVED);
        ProductCondition.DatabaseConverter conditions = new ProductCondition.DatabaseConverter();
        assertThat(conditions.convertToDatabaseColumn(ProductCondition.LIKE_NEW)).isEqualTo("Like New");
        assertThat(conditions.convertToEntityAttribute("Used")).isEqualTo(ProductCondition.USED);
        assertThat(new ProductStatus.DatabaseConverter().convertToDatabaseColumn(ProductStatus.RESERVED)).isEqualTo("Reserved");
        assertThat(ModerationStatus.REJECTED.apiValue()).isEqualTo("BLOCKED");
    }

    // ---------------------------------------------------------------- listing form (same limits as the frontend)

    @Test
    void aValidListingPasses() {
        assertThat(VALIDATOR.validate(listing("Casio calculator", 250_000L, null))).isEmpty();
        assertThat(VALIDATOR.validate(listing("Casio calculator", 250_000L, 400_000L))).isEmpty();
        assertThat(VALIDATOR.validate(listing("Pens!", 1_000L, null))).isEmpty();
        assertThat(VALIDATOR.validate(listing("x".repeat(80), 100_000_000L, null))).isEmpty();
    }

    @Test
    void listingLimitsAreEnforced() {
        assertThat(fields(listing("Pen", 100_000L, null))).containsExactly("title");
        assertThat(fields(listing("x".repeat(81), 100_000L, null))).containsExactly("title");
        assertThat(fields(listing("Cheap pencil", 999L, null))).containsExactly("price");
        assertThat(fields(listing("Pricey pencil", 100_000_001L, null))).containsExactly("price");
        assertThat(fields(listing("Equal original", 100_000L, 100_000L))).containsExactly("originalPriceHigherThanPrice");
        assertThat(fields(new ListingRequest("Valid title", "too short", 100_000L, null, ProductCondition.USED, 1, null)))
                .containsExactly("description");
        assertThat(fields(new ListingRequest("Valid title", "A clean, well kept item from a student.", null, null, null, null, null)))
                .containsExactlyInAnyOrder("price", "condition", "categoryId");
    }

    private static ListingRequest listing(String title, Long price, Long originalPrice) {
        return new ListingRequest(title, "A clean, well kept item from a student.", price, originalPrice, ProductCondition.USED, 1, null);
    }

    private static List<String> fields(ListingRequest request) {
        Set<ConstraintViolation<ListingRequest>> violations = VALIDATOR.validate(request);
        return violations.stream().map(v -> v.getPropertyPath().toString()).toList();
    }
}
