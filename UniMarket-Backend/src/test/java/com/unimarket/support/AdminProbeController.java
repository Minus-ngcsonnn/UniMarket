package com.unimarket.support;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * TEST ONLY (src/test): a harmless endpoint under {@code /api/admin/**} used to prove that the
 * security rules let admins in and keep students out. No admin API exists in production code yet.
 */
@RestController
public class AdminProbeController {

    @GetMapping("/api/admin/test-probe")
    public Map<String, String> probe() {
        return Map.of("status", "admin ok");
    }
}
