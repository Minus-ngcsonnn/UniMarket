package com.unimarket.service.account;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.dto.order.OrderRequests;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The signed-in user's own contact settings ({@code Users.Phone}, {@code ZaloUrl}, {@code ShowContact}).
 *
 * <p>The sharing policy is unchanged (Business Plan 3.2, 6.7): phone / Zalo are shown on listings and the public
 * profile only while ShowContact is on. Whether that should need a signed-in viewer is a pending team decision; this
 * service only lets users manage their own values.</p>
 */
@Service
@Profile("!nodb")
public class ContactSettingsService {

    /** A Zalo profile link. */
    public static final String ZALO_PATTERN = "^https://zalo\\.me/[A-Za-z0-9._-]{1,100}$";
    private static final Logger log = LoggerFactory.getLogger(ContactSettingsService.class);

    private final NamedParameterJdbcTemplate jdbc;

    public ContactSettingsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Settings get(AuthenticatedUser user) {
        return jdbc.queryForObject("SELECT Phone, ZaloUrl, ShowContact FROM dbo.Users WHERE UserId = :id", Map.of("id", user.id()),
                (rs, i) -> new Settings(rs.getString("Phone"), rs.getString("ZaloUrl"), rs.getBoolean("ShowContact")));
    }

    /**
     * Replaces the three values. Blank phone / Zalo clear them. Sharing needs at least one of them.
     */
    public Settings update(String phone, String zaloUrl, boolean showContact, AuthenticatedUser user) {
        String cleanPhone = phone == null || phone.isBlank() ? null : phone.trim();
        String cleanZalo = zaloUrl == null || zaloUrl.isBlank() ? null : zaloUrl.trim();
        List<ApiErrorResponse.FieldError> errors = new ArrayList<>();
        if (cleanPhone != null && !cleanPhone.matches(OrderRequests.PHONE_PATTERN)) {
            errors.add(new ApiErrorResponse.FieldError("phone", "must be a Vietnamese mobile number"));
        }
        if (cleanZalo != null && !cleanZalo.matches(ZALO_PATTERN)) {
            errors.add(new ApiErrorResponse.FieldError("zaloUrl", "must be a Zalo link like https://zalo.me/0912345678"));
        }
        if (showContact && cleanPhone == null && cleanZalo == null) {
            errors.add(new ApiErrorResponse.FieldError("showContact", "add a phone number or a Zalo link to share"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        jdbc.update("UPDATE dbo.Users SET Phone = :phone, ZaloUrl = :zalo, ShowContact = :show, UpdatedAt = SYSUTCDATETIME() WHERE UserId = :id",
                new MapSqlParameterSource("id", user.id()).addValue("phone", cleanPhone == null ? null : cleanPhone.replaceAll("[\\s.-]", ""), Types.VARCHAR)
                        .addValue("zalo", cleanZalo, Types.NVARCHAR).addValue("show", showContact));
        log.info("Contact settings updated by user {} (sharing {})", user.id(), showContact ? "on" : "off");
        return get(user);
    }

    /** @param showContact true: phone / Zalo are shown on the user's listings and public profile */
    public record Settings(String phone, String zaloUrl, boolean showContact) {
    }
}
