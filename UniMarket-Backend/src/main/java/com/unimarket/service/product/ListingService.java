package com.unimarket.service.product;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.product.ListingRequest;
import com.unimarket.dto.product.ProductDetailResponse;
import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.entity.Campus;
import com.unimarket.entity.Category;
import com.unimarket.entity.LocationZone;
import com.unimarket.entity.Product;
import com.unimarket.entity.ProductImage;
import com.unimarket.entity.ProductStatus;
import com.unimarket.entity.User;
import com.unimarket.entity.UserRole;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.repository.CampusRepository;
import com.unimarket.repository.CategoryRepository;
import com.unimarket.repository.LocationZoneRepository;
import com.unimarket.repository.ProductImageRepository;
import com.unimarket.repository.ProductInsightsRepository;
import com.unimarket.repository.ProductRepository;
import com.unimarket.repository.UserRepository;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.storage.ImageStorage;
import com.unimarket.service.storage.ImageType;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/**
 * Seller listing management (Business Plan 3.2 "upload product listings", 6.3 "Product Management",
 * 6.5 "Product Listing Process").
 *
 * <ul>
 *   <li>The seller is always the signed-in account; a seller id is never read from the request.</li>
 *   <li>Only the seller or an admin may change a listing; only Draft / Available listings can change
 *       (Reserved and Sold belong to an order: 409 LISTING_NOT_EDITABLE).</li>
 *   <li>New listings are Available + Pending moderation; any change sends an approved listing back to
 *       moderation (approved pre-moderation decision, 2026-11-01).</li>
 *   <li>Removing is a soft delete ({@code Status = 'Removed'}): rows referenced by orders, carts,
 *       favorites, reports or promotions are kept.</li>
 *   <li>Edits lock the listing row (UPDLOCK) so they cannot interleave with a checkout of the same item.</li>
 * </ul>
 */
@Service
@Profile("!nodb")
public class ListingService {

    private static final Logger log = LoggerFactory.getLogger(ListingService.class);

    private final ProductRepository products;
    private final ProductImageRepository images;
    private final UserRepository users;
    private final CategoryRepository categories;
    private final CampusRepository campuses;
    private final LocationZoneRepository zones;
    private final ProductInsightsRepository insights;
    private final ImageStorage storage;
    private final ProductMapper mapper;
    private final TransactionTemplate transaction;
    private final EntityManager entityManager;
    private final Clock clock;
    private final int maxPhotos;
    private final long maxPhotoBytes;

    public ListingService(ProductRepository products, ProductImageRepository images, UserRepository users, CategoryRepository categories,
                          CampusRepository campuses, LocationZoneRepository zones, ProductInsightsRepository insights, ImageStorage storage, ProductMapper mapper,
                          PlatformTransactionManager transactionManager, EntityManager entityManager, Clock clock,
                          @Value("${unimarket.listing.max-photos}") int maxPhotos,
                          @Value("${spring.servlet.multipart.max-file-size}") org.springframework.util.unit.DataSize maxPhotoSize) {
        this.products = products;
        this.images = images;
        this.users = users;
        this.categories = categories;
        this.campuses = campuses;
        this.zones = zones;
        this.insights = insights;
        this.storage = storage;
        this.mapper = mapper;
        this.transaction = new TransactionTemplate(transactionManager);
        this.entityManager = entityManager;
        this.clock = clock;
        this.maxPhotos = maxPhotos;
        this.maxPhotoBytes = maxPhotoSize.toBytes();
    }

    /**
     * Publishes a listing with 1–8 photos. Photos are validated before anything is written; stored files
     * are deleted again if the database insert fails.
     */
    public ProductDetailResponse create(ListingRequest request, List<MultipartFile> photos, AuthenticatedUser seller) {
        List<ValidatedPhoto> validated = validatePhotos(photos, 0);
        if (validated.isEmpty()) {
            throw new ApiException(ErrorCode.IMAGE_REQUIRED);
        }
        return withStoredPhotos(validated, references -> transaction.execute(status -> {
            User owner = users.findById(seller.id()).orElseThrow(() -> new ApiException(ErrorCode.AUTHENTICATION_REQUIRED));
            Location location = locationFor(owner, request);
            Product product = Product.newListing(owner, activeCategory(request.categoryId()),
                    location.campus(), location.pickupZone(), request.title().trim(), request.description().trim(), request.condition(),
                    BigDecimal.valueOf(request.price()), toPrice(request.originalPrice()), nowUtc());
            products.saveAndFlush(product);
            for (int i = 0; i < references.size(); i++) {
                images.save(new ProductImage(product, references.get(i), i));
            }
            images.flush();
            log.info("Listing {} created by user {}", product.getId(), seller.id());
            return reloadDetail(product.getId());
        }));
    }

    /** Replaces the editable fields of a Draft / Available listing. */
    public ProductDetailResponse update(int productId, ListingRequest request, AuthenticatedUser viewer) {
        return transaction.execute(status -> {
            Product product = lockForChange(productId, viewer);
            Location location = locationFor(product.getSeller(), request);
            product.update(activeCategory(request.categoryId()), location.campus(), location.pickupZone(),
                    request.title().trim(), request.description().trim(), request.condition(),
                    BigDecimal.valueOf(request.price()), toPrice(request.originalPrice()), nowUtc());
            products.flush();
            return reloadDetail(productId);
        });
    }

    /** Soft-removes a Draft / Available listing that is not part of any open order. */
    public void remove(int productId, AuthenticatedUser viewer) {
        transaction.executeWithoutResult(status -> {
            Product product = lockForChange(productId, viewer);
            if (insights.isInActiveOrder(productId)) {
                throw new ApiException(ErrorCode.LISTING_NOT_EDITABLE);
            }
            product.remove(nowUtc());
            log.info("Listing {} removed by user {}", productId, viewer.id());
        });
    }

    /** Adds photos (up to 8 in total). */
    public ProductDetailResponse addPhotos(int productId, List<MultipartFile> photos, AuthenticatedUser viewer) {
        List<ValidatedPhoto> validated = validatePhotos(photos, 0);
        if (validated.isEmpty()) {
            throw new ApiException(ErrorCode.IMAGE_REQUIRED);
        }
        return withStoredPhotos(validated, references -> transaction.execute(status -> {
            Product product = lockForChange(productId, viewer);
            List<ProductImage> current = images.findByProduct_IdOrderBySortOrderAsc(productId);
            if (current.size() + references.size() > maxPhotos) {
                throw new ApiException(ErrorCode.TOO_MANY_IMAGES);
            }
            int next = current.isEmpty() ? 0 : current.get(current.size() - 1).getSortOrder() + 1;
            for (String reference : references) {
                images.save(new ProductImage(product, reference, next++));
            }
            product.markChanged(nowUtc());
            images.flush();
            return reloadDetail(productId);
        }));
    }

    /** Deletes one photo; the last photo cannot be deleted. The file is deleted after commit. */
    public ProductDetailResponse deletePhoto(int productId, int imageId, AuthenticatedUser viewer) {
        return transaction.execute(status -> {
            Product product = lockForChange(productId, viewer);
            List<ProductImage> current = images.findByProduct_IdOrderBySortOrderAsc(productId);
            ProductImage image = current.stream().filter(i -> i.getId() == imageId).findFirst()
                    .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Photo not found."));
            if (current.size() == 1) {
                throw new ApiException(ErrorCode.IMAGE_REQUIRED);
            }
            images.delete(image);
            product.markChanged(nowUtc());
            images.flush();
            String reference = image.getImageUrl();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    storage.delete(reference);
                }
            });
            return reloadDetail(productId);
        });
    }

    /** Sets the photo order; the first id becomes the main photo. Must list every photo exactly once. */
    public ProductDetailResponse reorderPhotos(int productId, List<Integer> imageIds, AuthenticatedUser viewer) {
        return transaction.execute(status -> {
            Product product = lockForChange(productId, viewer);
            List<ProductImage> current = images.findByProduct_IdOrderBySortOrderAsc(productId);
            if (imageIds.size() != current.size() || !new HashSet<>(imageIds).equals(new HashSet<>(current.stream().map(ProductImage::getId).toList()))) {
                throw new ValidationException(List.of(new ApiErrorResponse.FieldError("imageIds", "must list every photo of the listing exactly once")));
            }
            // Two steps because (ProductId, SortOrder) is unique.
            int offset = current.stream().mapToInt(ProductImage::getSortOrder).max().orElse(0) + 1;
            current.forEach(image -> image.setSortOrder(image.getSortOrder() + offset));
            images.flush();
            Map<Integer, ProductImage> byId = new java.util.HashMap<>();
            current.forEach(image -> byId.put(image.getId(), image));
            for (int i = 0; i < imageIds.size(); i++) {
                byId.get(imageIds.get(i)).setSortOrder(i);
            }
            product.markChanged(nowUtc());
            images.flush();
            return reloadDetail(productId);
        });
    }

    /** "My listings": every listing of the signed-in seller except removed ones, newest first. */
    public List<ProductSummaryResponse> myListings(AuthenticatedUser seller) {
        return transaction.execute(status -> mapper.toSummaries(
                products.findBySeller_IdAndStatusNot(seller.id(), ProductStatus.REMOVED,
                        Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))), true));
    }

    // ------------------------------------------------------------------ helpers

    /** Locks the row and checks ownership and status. 404 hides listings the viewer may not see. */
    private Product lockForChange(int productId, AuthenticatedUser viewer) {
        Product product = products.findForUpdateById(productId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
        boolean owner = product.getSeller().getId().equals(viewer.id());
        if (!owner && viewer.role() != UserRole.ADMIN) {
            throw product.isPubliclyVisible() ? new ApiException(ErrorCode.ACCESS_DENIED)
                    : new ApiException(ErrorCode.NOT_FOUND, "Listing not found.");
        }
        if (!ProductStatus.EDITABLE.contains(product.getStatus())) {
            throw new ApiException(ErrorCode.LISTING_NOT_EDITABLE);
        }
        return product;
    }

    private Category activeCategory(Integer categoryId) {
        return categories.findById(categoryId).filter(Category::isActive)
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_CATEGORY));
    }

    private record Location(Campus campus, LocationZone pickupZone) {
    }

    /**
     * V003 listing location. Seller with an official campus: the listing campus must belong to the seller's university
     * (default: the seller's campus) and a pickup area is optional. Seller without a campus (self-declared university):
     * no campus can be chosen and a pickup area is required. A pickup area must be an active zone.
     */
    private Location locationFor(User seller, ListingRequest request) {
        LocationZone zone = request.pickupZoneId() == null ? null
                : zones.findById(request.pickupZoneId()).filter(LocationZone::isActive)
                        .orElseThrow(() -> new ApiException(ErrorCode.INVALID_ZONE));
        Campus sellerCampus = seller.getCampus();
        if (sellerCampus == null) {
            if (request.campusId() != null) {
                throw new ApiException(ErrorCode.INVALID_CAMPUS);
            }
            if (zone == null) {
                throw new ValidationException(List.of(new ApiErrorResponse.FieldError("pickupZoneId",
                        "is required when your account has no campus")));
            }
            return new Location(null, zone);
        }
        if (request.campusId() == null) {
            return new Location(sellerCampus, zone);
        }
        Campus campus = campuses.findById(request.campusId())
                .filter(c -> c.getUniversity().getId().equals(sellerCampus.getUniversity().getId()))
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_CAMPUS));
        return new Location(campus, zone);
    }

    private ProductDetailResponse reloadDetail(int productId) {
        entityManager.flush();
        entityManager.clear();
        return mapper.toDetail(products.findWithDetailsById(productId).orElseThrow(), true);
    }

    /**
     * Checks count, size and real file type (magic bytes), then strips privacy metadata (EXIF / GPS, XMP, IPTC). The
     * multipart config already refuses larger files; the size is checked again here so the rule holds even if that config
     * changes.
     */
    private List<ValidatedPhoto> validatePhotos(List<MultipartFile> photos, int existing) {
        List<MultipartFile> files = photos == null ? List.of() : photos.stream().filter(f -> f != null && !f.isEmpty()).toList();
        if (existing + files.size() > maxPhotos) {
            throw new ApiException(ErrorCode.TOO_MANY_IMAGES);
        }
        List<ValidatedPhoto> result = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file.getSize() > maxPhotoBytes) {
                throw new ApiException(ErrorCode.IMAGE_TOO_LARGE);
            }
            try {
                byte[] bytes = file.getBytes();
                ImageType type = ImageType.detect(bytes).orElseThrow(() -> new ApiException(ErrorCode.INVALID_IMAGE));
                // Stage 6.4: remove EXIF (GPS location), XMP, IPTC and text metadata before the file is stored.
                result.add(new ValidatedPhoto(com.unimarket.service.storage.ImageMetadataStripper.strip(bytes, type), type));
            } catch (IOException ex) {
                throw new UncheckedIOException(ex);
            }
        }
        return result;
    }

    /** Stores the files, runs the database work, and deletes the files again if that work fails. */
    private <T> T withStoredPhotos(List<ValidatedPhoto> photos, java.util.function.Function<List<String>, T> work) {
        List<String> references = new ArrayList<>();
        try {
            for (ValidatedPhoto photo : photos) {
                references.add(storage.store(photo.bytes(), photo.type()));
            }
            return work.apply(references);
        } catch (RuntimeException ex) {
            references.forEach(storage::delete);
            throw ex;
        }
    }

    private static BigDecimal toPrice(Long value) {
        return value == null ? null : BigDecimal.valueOf(value);
    }

    private LocalDateTime nowUtc() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private record ValidatedPhoto(byte[] bytes, ImageType type) {
    }
}
