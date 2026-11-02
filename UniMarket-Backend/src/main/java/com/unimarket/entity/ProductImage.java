package com.unimarket.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Nationalized;

/**
 * Maps {@code dbo.ProductImages}. The photo with the lowest {@code SortOrder} is the main photo;
 * {@code (ProductId, SortOrder)} is unique. {@code ImageUrl} is a reference produced by the server
 * (e.g. {@code /media/products/<uuid>.jpg}), never a path supplied by the client.
 */
@Entity
@Table(name = "ProductImages", schema = "dbo")
public class ProductImage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ImageId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ProductId", nullable = false, updatable = false)
    private Product product;

    @Nationalized
    @Column(name = "ImageUrl", nullable = false, length = 1000)
    private String imageUrl;

    @Column(name = "SortOrder", nullable = false)
    private int sortOrder;

    /** Required by JPA. */
    protected ProductImage() {
    }

    public ProductImage(Product product, String imageUrl, int sortOrder) {
        this.product = product;
        this.imageUrl = imageUrl;
        this.sortOrder = sortOrder;
    }

    public Integer getId() { return id; }
    public Product getProduct() { return product; }
    public String getImageUrl() { return imageUrl; }
    public int getSortOrder() { return sortOrder; }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
