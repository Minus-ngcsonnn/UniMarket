package com.unimarket.repository;

import com.unimarket.entity.UniversityEmailDomain;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Read access to {@code dbo.UniversityEmailDomains}, the approved institutional email domains.
 */
public interface UniversityEmailDomainRepository extends JpaRepository<UniversityEmailDomain, String> {

    /** @return the approved domain (lower case, e.g. {@code fpt.edu.vn}) with its university */
    @EntityGraph(attributePaths = "university")
    Optional<UniversityEmailDomain> findWithUniversityByDomain(String domain);
}
