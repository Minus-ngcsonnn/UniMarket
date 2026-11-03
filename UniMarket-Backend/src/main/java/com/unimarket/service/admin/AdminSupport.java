package com.unimarket.service.admin;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.exception.ValidationException;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Shared helpers of the admin services: the audit trail ({@code dbo.AdminActions}, the V001/V002 audit table, with the
 * naming already used by the demo data: Action "Suspend account" / EntityType "User", "Reject listing" / "Product")
 * and reason validation.
 */
@Component
@Profile("!nodb")
public class AdminSupport {

    /** Minimum length of an admin's reason / resolution (same rule as the frontend, MIN_REASON_LENGTH). */
    public static final int MIN_REASON_LENGTH = 10;

    private final JdbcTemplate jdbc;

    public AdminSupport(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Records an admin action. Call inside the same transaction as the change it describes. */
    public void audit(int adminId, String action, String entityType, long entityId, String reason) {
        jdbc.update("INSERT dbo.AdminActions (AdminId, Action, EntityType, EntityId, Reason) VALUES (?, ?, ?, ?, ?)",
                adminId, action, entityType, entityId, reason);
    }

    /** @return the trimmed reason, or a 400 when it is missing or shorter than {@value #MIN_REASON_LENGTH} characters */
    public static String requireReason(String reason, String field, int maxLength) {
        String text = reason == null ? "" : reason.trim();
        if (text.length() < MIN_REASON_LENGTH || text.length() > maxLength) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError(field,
                    "must be " + MIN_REASON_LENGTH + " to " + maxLength + " characters")));
        }
        return text;
    }

    /** Validates 1-based paging. */
    public static void requirePage(int page, int size) {
        if (page < 1 || size < 1 || size > 100) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("page", "page must be 1 or more and size 1 to 100")));
        }
    }
}
