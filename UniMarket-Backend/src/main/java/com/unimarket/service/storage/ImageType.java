package com.unimarket.service.storage;

import java.util.Optional;

/**
 * Image formats accepted for listing photos (approved decision Q2: JPG, PNG, WebP). The type is detected
 * from the file's first bytes ("magic numbers"); the client's file name and Content-Type are ignored.
 */
public enum ImageType {

    JPEG("jpg"),
    PNG("png"),
    WEBP("webp");

    private final String extension;

    ImageType(String extension) {
        this.extension = extension;
    }

    /** @return file extension used for stored files */
    public String extension() {
        return extension;
    }

    /**
     * @param head the first bytes of the file (at least 12 for WebP)
     * @return the detected type, or empty when the bytes are not a JPEG, PNG or WebP image
     */
    public static Optional<ImageType> detect(byte[] head) {
        if (head == null) {
            return Optional.empty();
        }
        if (head.length >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
            return Optional.of(JPEG);
        }
        if (head.length >= 8 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G'
                && head[4] == 0x0D && head[5] == 0x0A && head[6] == 0x1A && head[7] == 0x0A) {
            return Optional.of(PNG);
        }
        if (head.length >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P') {
            return Optional.of(WEBP);
        }
        return Optional.empty();
    }
}
