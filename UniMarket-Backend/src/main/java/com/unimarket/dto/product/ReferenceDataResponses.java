package com.unimarket.dto.product;

import java.util.List;

/**
 * Responses of the reference-data endpoints (categories, universities, campuses).
 */
public final class ReferenceDataResponses {

    private ReferenceDataResponses() {
    }

    /**
     * @param id             stable id
     * @param name           database name
     * @param slug           derived from the name
     * @param availableCount public, available listings in this category
     */
    public record CategoryResponse(Integer id, String name, String slug, long availableCount, boolean custom) {
    }

    /**
     * A demo pickup / delivery area (V003) with its APPROXIMATE public centre point (V006: used by the map to describe
     * a pin, e.g. "about 1.2 km from Hoa Lac", and to warn when a pin is far from the chosen area). Not an address.
     */
    public record ZoneArea(Integer id, String code, String name, String province,
                           java.math.BigDecimal centerLatitude, java.math.BigDecimal centerLongitude) {
    }

    /**
     * @param id       {@code Universities.UniversityId}
     * @param name     e.g. "FPT University"
     * @param code     e.g. "FPT"
     * @param campuses its campuses
     */
    public record UniversityResponse(Integer id, String name, String code, List<ReferenceDtos.CampusRef> campuses) {
    }

    /**
     * Body of {@code PUT /api/products/{id}/images/order}.
     *
     * @param imageIds every photo id of the listing, in the new order (first = main photo)
     */
    public record ImageOrderRequest(@jakarta.validation.constraints.NotEmpty List<Integer> imageIds) {
    }

    /**
     * Response of saving a favorite.
     *
     * @param productId the listing
     * @param saved     always true
     * @param created   false when it was already saved (no duplicate is created)
     */
    public record FavoriteResponse(Integer productId, boolean saved, boolean created) {
    }
}
