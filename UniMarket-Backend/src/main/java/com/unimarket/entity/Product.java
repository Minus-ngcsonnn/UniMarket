package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Maps {@code dbo.Products} (V001 module 2; one listing = one physical item).
 *
 * <p>Not mapped: {@code Version} (rowversion). Concurrency with checkout is handled with row locks
 * ({@code usp_Checkout} reads listings with UPDLOCK; edits lock the row with PESSIMISTIC_WRITE).
 * Status changes to Reserved / Sold happen only in the order procedures, never here.</p>
 */
@Entity
@Table(name = "Products", schema = "dbo")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ProductId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "SellerId", nullable = false, updatable = false)
    private User seller;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CategoryId", nullable = false)
    private Category category;

    /** V006: the seller-confirmed handover point (map / GPS), both or neither; never in public responses. */
    @Column(name = "PickupLatitude", precision = 9, scale = 6)
    private BigDecimal pickupLatitude;

    @Column(name = "PickupLongitude", precision = 9, scale = 6)
    private BigDecimal pickupLongitude;

    /** V006: optional private pickup instructions, e.g. "Gate 2 of the university". */
    @Nationalized
    @Column(name = "PickupInstructions", length = 300)
    private String pickupInstructions;

    /** V005: seller-typed category of an "Other" listing (2-60 characters), null for every other category. */
    @Nationalized
    @Column(name = "CustomCategoryName", length = 60)
    private String customCategoryName;

    /** V003: optional when a pickup zone is given (CK_Products_Location). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CampusId")
    private Campus campus;

    /** V003: explicit pickup area; when null the campus zone is used. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PickupZoneId")
    private LocationZone pickupZone;

    @Nationalized
    @Column(name = "Title", nullable = false, length = 200)
    private String title;

    @Nationalized
    @Column(name = "Description", nullable = false, columnDefinition = "nvarchar(max)")
    private String description;

    @Convert(converter = ProductCondition.DatabaseConverter.class)
    @Column(name = "Condition", nullable = false, length = 10)
    private ProductCondition condition;

    @Column(name = "Price", nullable = false, precision = 18, scale = 0)
    private BigDecimal price;

    @Column(name = "OriginalPrice", precision = 18, scale = 0)
    private BigDecimal originalPrice;

    @Convert(converter = ProductStatus.DatabaseConverter.class)
    @Column(name = "Status", nullable = false, length = 12)
    private ProductStatus status;

    @Convert(converter = ModerationStatus.DatabaseConverter.class)
    @Column(name = "ModerationStatus", nullable = false, length = 10)
    private ModerationStatus moderationStatus;

    @Column(name = "CreatedAt", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "UpdatedAt", nullable = false)
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "product", fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<ProductImage> images = new ArrayList<>();

    /** Required by JPA. */
    protected Product() {
    }

    /**
     * A new listing: Available, waiting for moderation (pre-moderation decision of 2026-11-01).
     *
     * @param seller the signed-in student
     * @param nowUtc creation time (UTC)
     */
    public static Product newListing(User seller, Category category, String customCategoryName, Campus campus, LocationZone pickupZone,
                                     String title, String description, ProductCondition condition, BigDecimal price,
                                     BigDecimal originalPrice, LocalDateTime nowUtc) {
        Product product = new Product();
        product.seller = seller;
        product.status = ProductStatus.AVAILABLE;
        product.moderationStatus = ModerationStatus.PENDING;
        product.createdAt = nowUtc;
        product.update(category, customCategoryName, campus, pickupZone, title, description, condition, price, originalPrice, nowUtc);
        return product;
    }

    /**
     * Replaces the editable fields. Any change of an approved or blocked listing sends it back to
     * moderation (approved decision of 2026-11-01).
     */
    public void update(Category category, String customCategoryName, Campus campus, LocationZone pickupZone, String title,
                       String description, ProductCondition condition, BigDecimal price, BigDecimal originalPrice, LocalDateTime nowUtc) {
        if (campus == null && pickupZone == null) {
            throw new IllegalArgumentException("A listing needs a campus or a pickup zone");
        }
        if (category.allowsCustomName() == (customCategoryName == null)) {
            throw new IllegalArgumentException("A custom category name is required exactly for the \"Other\" category");
        }
        this.category = category;
        this.customCategoryName = customCategoryName;
        this.campus = campus;
        this.pickupZone = pickupZone;
        this.title = title;
        this.description = description;
        this.condition = condition;
        this.price = price;
        this.originalPrice = originalPrice;
        markChanged(nowUtc);
    }

    /** Records an edit (also used when photos change): back to moderation, new UpdatedAt. */
    public void markChanged(LocalDateTime nowUtc) {
        this.moderationStatus = ModerationStatus.PENDING;
        this.updatedAt = nowUtc;
    }

    /** Soft removal ({@code Status = 'Removed'}); the row, its photos and history are kept. */
    public void remove(LocalDateTime nowUtc) {
        this.status = ProductStatus.REMOVED;
        this.updatedAt = nowUtc;
    }

    /** @return true when buyers may see the listing page (approved and Available / Reserved / Sold) */
    public boolean isPubliclyVisible() {
        return moderationStatus == ModerationStatus.APPROVED && ProductStatus.PUBLICLY_VISIBLE.contains(status);
    }

    public Integer getId() { return id; }
    public User getSeller() { return seller; }
    public Category getCategory() { return category; }

    /**
     * Sets the confirmed pickup point (V006). Both coordinates or neither; instructions are optional.
     * Does not change moderation by itself: it is always saved together with an edit.
     */
    public void setPickupPoint(BigDecimal latitude, BigDecimal longitude, String instructions) {
        if ((latitude == null) != (longitude == null)) {
            throw new IllegalArgumentException("Pickup latitude and longitude go together");
        }
        this.pickupLatitude = latitude;
        this.pickupLongitude = longitude;
        this.pickupInstructions = instructions;
    }

    public BigDecimal getPickupLatitude() { return pickupLatitude; }

    public BigDecimal getPickupLongitude() { return pickupLongitude; }

    public String getPickupInstructions() { return pickupInstructions; }

    /** @return the seller-typed category name of an "Other" listing (V005), otherwise null */
    public String getCustomCategoryName() { return customCategoryName; }
    public Campus getCampus() { return campus; }
    public LocationZone getPickupZone() { return pickupZone; }

    /** @return the effective pickup area: the explicit zone, else the campus zone (may be null only before V003 data) */
    public LocationZone getEffectivePickupZone() {
        return pickupZone != null ? pickupZone : campus == null ? null : campus.getZone();
    }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public ProductCondition getCondition() { return condition; }
    public BigDecimal getPrice() { return price; }
    public BigDecimal getOriginalPrice() { return originalPrice; }
    public ProductStatus getStatus() { return status; }
    public ModerationStatus getModerationStatus() { return moderationStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public List<ProductImage> getImages() { return images; }
}
