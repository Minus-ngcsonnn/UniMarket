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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CampusId", nullable = false)
    private Campus campus;

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
    public static Product newListing(User seller, Category category, Campus campus, String title, String description,
                                     ProductCondition condition, BigDecimal price, BigDecimal originalPrice, LocalDateTime nowUtc) {
        Product product = new Product();
        product.seller = seller;
        product.status = ProductStatus.AVAILABLE;
        product.moderationStatus = ModerationStatus.PENDING;
        product.createdAt = nowUtc;
        product.update(category, campus, title, description, condition, price, originalPrice, nowUtc);
        return product;
    }

    /**
     * Replaces the editable fields. Any change of an approved or blocked listing sends it back to
     * moderation (approved decision of 2026-11-01).
     */
    public void update(Category category, Campus campus, String title, String description, ProductCondition condition,
                       BigDecimal price, BigDecimal originalPrice, LocalDateTime nowUtc) {
        this.category = category;
        this.campus = campus;
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
    public Campus getCampus() { return campus; }
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
