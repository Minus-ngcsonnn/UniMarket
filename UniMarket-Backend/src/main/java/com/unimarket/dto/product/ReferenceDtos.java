package com.unimarket.dto.product;

import com.unimarket.entity.Campus;
import com.unimarket.entity.Category;
import com.unimarket.entity.LocationZone;
import com.unimarket.entity.University;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Small reference objects shared by product responses and the reference-data endpoints.
 */
public final class ReferenceDtos {

    private ReferenceDtos() {
    }

    /**
     * @param id   {@code Categories.CategoryId} (stable identifier)
     * @param name database name, e.g. "Dormitory items"
     * @param slug URL-friendly name derived from {@code name}, e.g. "dormitory-items"
     */
    public record CategoryRef(Integer id, String name, String slug) {
        public static CategoryRef from(Category category) {
            return new CategoryRef(category.getId(), category.getName(), slugOf(category.getName()));
        }
    }

    /**
     * @param id           {@code Campuses.CampusId}
     * @param name         e.g. "FPT Hoa Lac"
     * @param universityId owning university
     * @param university   university name
     */
    public record CampusRef(Integer id, String name, Integer universityId, String university) {
        /** @return the reference, or null when there is no campus (V003: campus is optional) */
        public static CampusRef from(Campus campus) {
            if (campus == null) {
                return null;
            }
            University university = campus.getUniversity();
            return new CampusRef(campus.getId(), campus.getName(), university.getId(), university.getName());
        }
    }

    /**
     * A demo area (V003 {@code LocationZones}); no coordinates are exposed.
     *
     * @param id       {@code LocationZones.ZoneId}
     * @param code     stable code, e.g. "HN-HOA-LAC"
     * @param name     area name
     * @param province province / city
     */
    public record ZoneRef(Integer id, String code, String name, String province) {
        /** @return the reference, or null when there is no zone */
        public static ZoneRef from(LocationZone zone) {
            return zone == null ? null : new ZoneRef(zone.getId(), zone.getCode(), zone.getName(), zone.getProvince());
        }
    }

    /** "Bikes & Ride" → "bikes-and-ride"; accents removed. Derived, so no slug column is needed. */
    public static String slugOf(String name) {
        String ascii = Normalizer.normalize(name.replace("&", " and ").replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }
}
