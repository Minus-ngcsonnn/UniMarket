package com.unimarket.controller;

import com.unimarket.dto.product.ListingRequest;
import com.unimarket.dto.product.ProductDetailResponse;
import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.dto.product.ReferenceDataResponses;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.product.ListingService;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Seller endpoints (token required): create, edit, remove listings, manage photos, "My listings".
 * The seller is always the signed-in account.
 */
@RestController
@Profile("!nodb")
public class ListingController {

    private final ListingService listings;

    public ListingController(ListingService listings) {
        this.listings = listings;
    }

    /**
     * Creates a listing. {@code multipart/form-data} with a JSON part {@code listing}
     * ({@link ListingRequest}) and 1–8 files in {@code photos}.
     */
    @PostMapping(path = "/api/products", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ProductDetailResponse create(@Valid @RequestPart("listing") ListingRequest listing,
                                        @RequestPart("photos") List<MultipartFile> photos,
                                        @AuthenticationPrincipal AuthenticatedUser user) {
        return listings.create(listing, photos, user);
    }

    /** Edits a Draft / Available listing (seller or admin). */
    @PutMapping("/api/products/{id}")
    public ProductDetailResponse update(@PathVariable int id, @Valid @RequestBody ListingRequest listing,
                                        @AuthenticationPrincipal AuthenticatedUser user) {
        return listings.update(id, listing, user);
    }

    /** Removes (soft) a Draft / Available listing that is not in an open order. */
    @DeleteMapping("/api/products/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable int id, @AuthenticationPrincipal AuthenticatedUser user) {
        listings.remove(id, user);
    }

    /** Adds photos ({@code multipart/form-data}, files in {@code photos}); at most 8 in total. */
    @PostMapping(path = "/api/products/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductDetailResponse addPhotos(@PathVariable int id, @RequestPart("photos") List<MultipartFile> photos,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return listings.addPhotos(id, photos, user);
    }

    /** Deletes one photo (not the last one). */
    @DeleteMapping("/api/products/{id}/images/{imageId}")
    public ProductDetailResponse deletePhoto(@PathVariable int id, @PathVariable int imageId,
                                             @AuthenticationPrincipal AuthenticatedUser user) {
        return listings.deletePhoto(id, imageId, user);
    }

    /** Reorders photos; the first id becomes the main photo. */
    @PutMapping("/api/products/{id}/images/order")
    public ProductDetailResponse reorderPhotos(@PathVariable int id, @Valid @RequestBody ReferenceDataResponses.ImageOrderRequest request,
                                               @AuthenticationPrincipal AuthenticatedUser user) {
        return listings.reorderPhotos(id, request.imageIds(), user);
    }

    /** "My listings": all own listings except removed ones, with moderation status. */
    @GetMapping("/api/me/products")
    public List<ProductSummaryResponse> myListings(@AuthenticationPrincipal AuthenticatedUser user) {
        return listings.myListings(user);
    }
}
