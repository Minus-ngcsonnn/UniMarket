package com.unimarket.admin;

import com.unimarket.service.admin.ReportService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Pure unit tests (no Spring, no database) for Stage 5 review rules. */
class AdminRulesTest {

    @Test
    void reportReasonsKeepTheirCodeAndDetailsIncludingColons() {
        assertThat(ReportService.parseReason("OFF_PLATFORM_PAYMENT: Asked me to pay at 10:30 by bank: ABC"))
                .containsExactly("OFF_PLATFORM_PAYMENT", "Asked me to pay at 10:30 by bank: ABC");
        assertThat(ReportService.parseReason("SPAM")).containsExactly("SPAM", null);
        assertThat(ReportService.parseReason("SPAM:   ")).containsExactly("SPAM", null);
    }

    @Test
    void textWithoutAKnownCodeIsReportedAsOtherWithTheWholeText() {
        // Older rows (e.g. demo data) and details that merely look like a code prefix.
        assertThat(ReportService.parseReason("Listing photos look stolen")).containsExactly("OTHER", "Listing photos look stolen");
        assertThat(ReportService.parseReason("NOT_A_CODE: something")).containsExactly("OTHER", "NOT_A_CODE: something");
        assertThat(ReportService.parseReason("spam: lower case is not a code")).containsExactly("OTHER", "spam: lower case is not a code");
        assertThat(ReportService.parseReason(null)).containsExactly("OTHER", null);
    }
}
