package com.unimarket.config;

import com.unimarket.service.storage.LocalDiskImageStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.Duration;

/**
 * Serves uploaded listing photos read-only under {@code /media/products/**} (public, like listing pages).
 * Files are immutable (new name for every upload), so they can be cached for a long time.
 * The folder is derived from the same property as {@link LocalDiskImageStorage}, so this configuration
 * does not need the storage bean (web test slices load it without services).
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final String uploadDir;

    public WebConfig(@Value("${unimarket.storage.upload-dir}") String uploadDir) {
        this.uploadDir = uploadDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = LocalDiskImageStorage.directoryOf(uploadDir).toUri().toString();
        registry.addResourceHandler(LocalDiskImageStorage.URL_PREFIX + "**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic());
    }
}
