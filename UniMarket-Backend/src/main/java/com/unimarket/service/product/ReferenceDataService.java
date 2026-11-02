package com.unimarket.service.product;

import com.unimarket.dto.product.ReferenceDataResponses;
import com.unimarket.dto.product.ReferenceDtos;
import com.unimarket.entity.Campus;
import com.unimarket.repository.CampusRepository;
import com.unimarket.repository.CategoryRepository;
import com.unimarket.repository.ProductInsightsRepository;
import com.unimarket.repository.UniversityRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Categories, universities and campuses for dropdowns and filters, read from the database
 * (nothing is hard-coded). Only active categories are returned.
 */
@Service
@Profile("!nodb")
public class ReferenceDataService {

    private final CategoryRepository categories;
    private final UniversityRepository universities;
    private final CampusRepository campuses;
    private final ProductInsightsRepository insights;

    public ReferenceDataService(CategoryRepository categories, UniversityRepository universities, CampusRepository campuses,
                                ProductInsightsRepository insights) {
        this.categories = categories;
        this.universities = universities;
        this.campuses = campuses;
        this.insights = insights;
    }

    /** @return active categories by name, with their number of public available listings */
    @Transactional(readOnly = true)
    public List<ReferenceDataResponses.CategoryResponse> categories() {
        Map<Integer, Long> counts = insights.availableCountByCategory();
        return categories.findByActiveTrueOrderByNameAsc().stream()
                .map(c -> new ReferenceDataResponses.CategoryResponse(c.getId(), c.getName(), ReferenceDtos.slugOf(c.getName()),
                        counts.getOrDefault(c.getId(), 0L)))
                .toList();
    }

    /** @return universities with their campuses */
    @Transactional(readOnly = true)
    public List<ReferenceDataResponses.UniversityResponse> universities() {
        Map<Integer, List<ReferenceDtos.CampusRef>> byUniversity = campuses.findAll().stream()
                .sorted(Comparator.comparing(Campus::getName))
                .map(ReferenceDtos.CampusRef::from)
                .collect(Collectors.groupingBy(ReferenceDtos.CampusRef::universityId));
        return universities.findAllByOrderByNameAsc().stream()
                .map(u -> new ReferenceDataResponses.UniversityResponse(u.getId(), u.getName(), u.getCode(),
                        byUniversity.getOrDefault(u.getId(), List.of())))
                .toList();
    }

    /** @param universityId optional filter @return campuses by name */
    @Transactional(readOnly = true)
    public List<ReferenceDtos.CampusRef> campuses(Integer universityId) {
        List<Campus> rows = universityId == null ? campuses.findAll() : campuses.findByUniversity_Id(universityId);
        return rows.stream().sorted(Comparator.comparing(Campus::getName)).map(ReferenceDtos.CampusRef::from).toList();
    }
}
