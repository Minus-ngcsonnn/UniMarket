package com.unimarket.service.storage;

/**
 * Stores listing photos and returns the reference saved in {@code ProductImages.ImageUrl}.
 * The MVP implementation is {@link LocalDiskImageStorage} (approved decision Q2: server disk behind
 * this abstraction); a cloud object store can replace it later without changing callers.
 */
public interface ImageStorage {

    /**
     * @param content validated image bytes
     * @param type    detected image type
     * @return public reference, e.g. {@code /media/products/3f2c...e1.jpg}
     */
    String store(byte[] content, ImageType type);

    /**
     * Deletes a photo created by this storage. References not produced by it (e.g. the demo images
     * of the V001 seed data) are ignored.
     *
     * @param reference value of {@code ProductImages.ImageUrl}
     */
    void delete(String reference);
}
