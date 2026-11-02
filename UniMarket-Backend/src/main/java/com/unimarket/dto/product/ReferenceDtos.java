package com.unimarket.dto.product;

import com.unimarket.entity.Campus;
import com.unimarket.entity.Category;
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
        public static CampusRef from(Campus campus) {
            University university = campus.getUniversity();
            return new CampusRef(campus.getId(), campus.getName(), university.getId(), university.getName());
        }
    }

    /** "Bikes & Ride" → "bikes-and-ride"; accents removed. Derived, so no slug column is needed. */
    public static String slugOf(String name) {
        String ascii = Normalizer.normalize(name.replace("&", " and ").replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }
}
