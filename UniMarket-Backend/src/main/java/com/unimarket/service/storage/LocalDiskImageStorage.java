package com.unimarket.service.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Stores photos as files in {@code <unimarket.storage.upload-dir>/products/} and serves them under
 * {@code /media/products/} (see {@code WebConfig}).
 *
 * <p>File names are random UUIDs chosen by the server with an extension derived from the detected type,
 * so no client-supplied name or path is ever used on disk (no path traversal, no overwrite).
 * Only references matching this exact pattern can be deleted.</p>
 */
@Component
public class LocalDiskImageStorage implements ImageStorage {

    /** Public URL prefix of stored photos. */
    public static final String URL_PREFIX = "/media/products/";

    private static final Logger log = LoggerFactory.getLogger(LocalDiskImageStorage.class);
    private static final Pattern OWN_REFERENCE = Pattern.compile("^/media/products/[0-9a-f]{32}\\.(jpg|png|webp)$");

    private final Path directory;

    /** @param uploadDir base upload directory ({@code UPLOAD_DIR}, default {@code uploads}) */
    public LocalDiskImageStorage(@Value("${unimarket.storage.upload-dir}") String uploadDir) {
        this.directory = directoryOf(uploadDir);
    }

    /** @return {@code <uploadDir>/products} as an absolute path (shared with the static file handler) */
    public static Path directoryOf(String uploadDir) {
        return Path.of(uploadDir).toAbsolutePath().normalize().resolve("products");
    }

    /** @return absolute directory that holds the photos */
    public Path directory() {
        return directory;
    }

    @Override
    public String store(byte[] content, ImageType type) {
        String name = UUID.randomUUID().toString().replace("-", "") + "." + type.extension();
        try {
            Files.createDirectories(directory);
            Files.write(directory.resolve(name), content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not store the photo", ex);
        }
        return URL_PREFIX + name;
    }

    @Override
    public void delete(String reference) {
        if (reference == null || !OWN_REFERENCE.matcher(reference).matches()) {
            return;
        }
        Path file = directory.resolve(reference.substring(URL_PREFIX.length())).normalize();
        if (!file.startsWith(directory)) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException ex) {
            log.warn("Could not delete photo file {}: {}", file.getFileName(), ex.getMessage());
        }
    }
}
