package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.service.order.OrderExpiryService;
import com.unimarket.service.order.PaymentResultService;
import com.unimarket.service.order.PaymentSimulator;
import com.unimarket.service.shipping.QuoteTokens;
import com.unimarket.service.shipping.ShippingCalculator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V003 end-to-end tests (isolated *Test copy with V003 applied): nationwide registration, listings without a campus,
 * demo areas, simulated shipping quotes and tokens, per-seller fees through {@code usp_CheckoutWithShipping}, legacy
 * orders, and the simulated Bank QR payment provider.
 *
 * <p>Writes data: runs only with {@code UNIMARKET_WRITE_IT=true} and refuses any database whose name does not contain
 * "Test". Demo rows are only read and compared before and after.</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_WRITE_IT", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"unimarket.payment.simulator.enabled=true"})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class V003IntegrationTest {

    private static final String FORMULA = ShippingCalculator.FORMULA_VERSION;

    @Autowired private MockMvc mvc;
    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private QuoteTokens tokens;
    @Autowired private PaymentSimulator simulator;
    @Autowired private OrderExpiryService expiry;

    private String demoChecksum;
    private int hoaLac;        // zone of campus 1 (FPT Hoa Lac)
    private int cauGiay;       // delivery zone used by most tests
    private int benThanh;      // far away (TP.HCM): out of range for every carrier
    private int sellerA;       // official campus 1
    private int sellerC;       // no campus: self-declared university, pickup area Cầu Giấy
    private int buyer;
    private String sellerAToken;
    private String sellerCToken;
    private String buyerToken;
    private String strangerToken;
    private String adminToken;

    @BeforeAll
    void setUp() throws Exception {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.SchemaMigrations WHERE Version = 'V003'", Integer.class))
                .as("V003 must be applied to this copy").isEqualTo(1);
        demoChecksum = demoChecksum();
        hoaLac = zone("HN-HOA-LAC");
        cauGiay = zone("HN-CAU-GIAY");
        benThanh = zone("HCM-BEN-THANH");
        sellerA = newUser("Student", "V003 Seller A", true);
        sellerC = newUser("Student", "V003 Seller C", false);
        buyer = newUser("Student", "V003 Buyer", true);
        sellerAToken = token(sellerA);
        sellerCToken = token(sellerC);
        buyerToken = token(buyer);
        strangerToken = token(newUser("Student", "V003 Stranger", true));
        adminToken = token(newUser("Admin", "V003 Admin", true));
    }

    @AfterAll
    void demoDataUnchanged() {
        assertThat(demoChecksum()).as("demo users, listings, orders, payments, settlements and carts must not change").isEqualTo(demoChecksum);
    }

    // ================================================================== registration and areas

    @Nested
    class RegistrationAndAreas {

        @Test
        void zonesArePublicNamesWithoutCoordinates() throws Exception {
            JsonNode zones = readJson(mvc.perform(get("/api/locations/zones")).andExpect(status().isOk()));
            assertThat(zones.size()).isEqualTo(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.LocationZones WHERE IsActive = 1", Integer.class));
            assertThat(zones.toString()).contains("HN-HOA-LAC").doesNotContain("latitude").doesNotContain("longitude");
        }

        @Test
        void aStudentCanRegisterWithATypedUniversityThatIsNotVerified() throws Exception {
            long universitiesBefore = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Universities", Long.class);
            String email = newEmail();
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                            "fullName", "Self Declared", "email", email, "password", "Secret123",
                            "universityName", "  Trường   Đại học Cần Thơ ", "homeZoneId", zone("CT-DH-CAN-THO")))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.user.campusId").doesNotExist())
                    .andExpect(jsonPath("$.user.university").value("Trường Đại học Cần Thơ"))
                    .andExpect(jsonPath("$.user.affiliation.source").value("SELF_DECLARED"))
                    .andExpect(jsonPath("$.user.homeZone.code").value("CT-DH-CAN-THO"))
                    .andExpect(jsonPath("$.user.verifiedStudent").doesNotExist());
            Map<String, Object> row = jdbc.queryForMap("SELECT CampusId, DeclaredUniversityName, DeclaredUniversityKey FROM dbo.Users WHERE Email = ?", email);
            assertThat(row.get("CampusId")).isNull();
            assertThat(row.get("DeclaredUniversityName")).isEqualTo("Trường Đại học Cần Thơ");
            assertThat(row.get("DeclaredUniversityKey")).isEqualTo("trường đại học cần thơ");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Universities", Long.class))
                    .as("free text is never inserted into Universities").isEqualTo(universitiesBefore);
        }

        @Test
        void exactlyOneAffiliationIsRequired() throws Exception {
            register(Map.of("fullName", "Both", "email", newEmail(), "password", "Secret123", "campusId", 1, "universityName", "Some University"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("affiliationProvided"));
            register(Map.of("fullName", "Neither", "email", newEmail(), "password", "Secret123", "universityName", "   "))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
            register(Map.of("fullName", "Too short", "email", newEmail(), "password", "Secret123", "universityName", "A"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("universityNameLongEnough"));
            register(Map.of("fullName", "Bad area", "email", newEmail(), "password", "Secret123", "campusId", 1, "homeZoneId", 999_999))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_ZONE"));
            register(Map.of("fullName", "Official", "email", newEmail(), "password", "Secret123", "campusId", 1))
                    .andExpect(status().isCreated()).andExpect(jsonPath("$.user.affiliation.source").value("OFFICIAL_CAMPUS"));
        }

        @Test
        void aSellerWithoutACampusMustChooseAPickupArea() throws Exception {
            int item = listingAtZone(sellerC, "Campusless edit", 40_000, cauGiay);
            editListing(sellerCToken, item, null, null).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("pickupZoneId"));
            editListing(sellerCToken, item, 1, cauGiay).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CAMPUS"));
            editListing(sellerCToken, item, null, 999_999).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_ZONE"));
            editListing(sellerCToken, item, null, hoaLac).andExpect(status().isOk())
                    .andExpect(jsonPath("$.campus").doesNotExist())
                    .andExpect(jsonPath("$.pickupZone.code").value("HN-HOA-LAC"))
                    .andExpect(jsonPath("$.seller.affiliationSource").value("SELF_DECLARED"));
            assertThat(jdbc.queryForObject("SELECT PickupZoneId FROM dbo.Products WHERE ProductId = ?", Integer.class, item)).isEqualTo(hoaLac);
            // A seller with a campus keeps it and may add a pickup area; without one the campus area is used.
            int official = listing(sellerA, "Official edit", 40_000);
            editListing(sellerAToken, official, null, cauGiay).andExpect(status().isOk())
                    .andExpect(jsonPath("$.campus.id").value(1)).andExpect(jsonPath("$.pickupZone.code").value("HN-CAU-GIAY"));
            jdbc.update("UPDATE dbo.Products SET ModerationStatus = 'Approved' WHERE ProductId IN (?, ?)", item, official);
            mvc.perform(get("/api/products/" + item)).andExpect(status().isOk()).andExpect(jsonPath("$.campus").doesNotExist())
                    .andExpect(jsonPath("$.pickupZone.code").value("HN-HOA-LAC"));
        }

        @Test
        void theCatalogFiltersByTheEffectivePickupAreaAndProvince() throws Exception {
            String tag = "Zonefilter" + UUID.randomUUID().toString().substring(0, 8);
            int atCampus = listing(sellerA, tag + " campus item", 50_000);                         // campus 1 -> HN-HOA-LAC
            int atCauGiay = listingAtZone(sellerC, tag + " cau giay item", 50_000, cauGiay);       // explicit zone, no campus
            int inHcm = listingAtZone(sellerC, tag + " hcm item", 50_000, benThanh);
            int campusButHcm = listing(sellerA, tag + " moved item", 50_000);
            jdbc.update("UPDATE dbo.Products SET PickupZoneId = ? WHERE ProductId = ?", benThanh, campusButHcm); // explicit zone wins
            String hanoi = jdbc.queryForObject("SELECT Province FROM dbo.LocationZones WHERE ZoneId = ?", String.class, hoaLac);
            String hcm = jdbc.queryForObject("SELECT Province FROM dbo.LocationZones WHERE ZoneId = ?", String.class, benThanh);

            assertThat(catalogIds("q=" + tag)).containsExactlyInAnyOrder(atCampus, atCauGiay, inHcm, campusButHcm);
            assertThat(catalogIds("q=" + tag + "&zoneId=" + hoaLac)).containsExactly(atCampus);
            assertThat(catalogIds("q=" + tag + "&zoneId=" + cauGiay)).containsExactly(atCauGiay);
            assertThat(catalogIds("q=" + tag + "&zoneId=" + benThanh)).containsExactlyInAnyOrder(inHcm, campusButHcm);
            assertThat(provinceIds(tag, hanoi)).containsExactlyInAnyOrder(atCampus, atCauGiay);
            assertThat(provinceIds(tag, hcm)).containsExactlyInAnyOrder(inHcm, campusButHcm);
            assertThat(catalogIds("q=" + tag + "&province=Nowhere")).isEmpty();
            JsonNode page = publicJson("/api/products?q=" + tag + "&zoneId=" + benThanh + "&size=1");
            assertThat(page.get("totalItems").asInt()).isEqualTo(2);   // count query uses the same joins: no duplicates
            assertThat(page.get("totalPages").asInt()).isEqualTo(2);
            mvc.perform(get("/api/products?zoneId=0")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("zoneId"));
            mvc.perform(get("/api/products?province=" + "x".repeat(101))).andExpect(status().isBadRequest());
        }

        @Test
        void catalogAndProfilesWorkForCampuslessAccounts() throws Exception {
            listingAtZone(sellerC, "Campusless catalog item", 33_000, cauGiay);
            JsonNode page = readJson(mvc.perform(get("/api/products").param("q", "Campusless catalog item")).andExpect(status().isOk()));
            assertThat(page.get("items").get(0).get("pickupZone").get("code").asText()).isEqualTo("HN-CAU-GIAY");
            assertThat(page.get("facets").get("campuses").toString()).doesNotContain("null");
            mvc.perform(get("/api/users/" + sellerC)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.affiliationSource").value("SELF_DECLARED"))
                    .andExpect(jsonPath("$.campusId").doesNotExist());
            mvc.perform(get("/api/admin/users/" + sellerC).header("Authorization", bearer(adminToken))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.declaredUniversity").value("Đại học Cần Thơ"))
                    .andExpect(jsonPath("$.campus").doesNotExist());
        }
    }

    // ================================================================== quotes and checkout

    @Nested
    class Shipping {

        @Test
        void eachSellerOrderGetsItsOwnVerifiedFee() throws Exception {
            int a = listing(sellerA, "Per-seller fee A", 120_000);           // Hòa Lạc
            int c = listingAtZone(sellerC, "Per-seller fee C", 50_000, cauGiay); // same area as the buyer: free
            JsonNode quote = quote(buyerToken, List.of(a, c), cauGiay).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()
                    .transform(V003IntegrationTest.this::readTree);
            assertThat(quote.get("simulated").asBoolean()).isTrue();
            assertThat(quote.get("formulaVersion").asText()).isEqualTo(FORMULA);
            assertThat(quote.get("disclaimer").asText()).contains("Simulated").contains("not a quotation");
            JsonNode groupA = group(quote, sellerA);
            JsonNode groupC = group(quote, sellerC);
            assertThat(groupC.get("distanceKm").decimalValue()).isEqualByComparingTo("0");
            assertThat(groupC.get("free").asBoolean()).isTrue();
            groupC.get("options").forEach(o -> assertThat(o.get("fee").asLong()).isZero());
            assertThat(groupA.get("free").asBoolean()).isFalse();
            assertThat(groupA.get("pickupZone").get("code").asText()).isEqualTo("HN-HOA-LAC");
            long grabFee = option(groupA, "GRAB_EXPRESS_SIM").get("fee").asLong();
            long standardFee = option(groupA, "STANDARD_SIM").get("fee").asLong();
            assertThat(grabFee).isGreaterThan(standardFee).isPositive();
            assertThat(grabFee % 1000).isZero();
            assertThat(option(groupA, "GRAB_EXPRESS_SIM").get("label").asText()).endsWith("(simulated)");

            JsonNode result = readJson(checkout(buyerToken, List.of(a, c), cauGiay, List.of(
                    choice(sellerA, "GRAB_EXPRESS_SIM", option(groupA, "GRAB_EXPRESS_SIM")),
                    choice(sellerC, "STANDARD_SIM", option(groupC, "STANDARD_SIM")))).andExpect(status().isCreated()));
            assertThat(result.get("orders")).hasSize(2);
            assertThat(result.get("shippingFee").asLong()).isEqualTo(grabFee);
            assertThat(result.get("total").asLong()).isEqualTo(170_000 + grabFee);
            for (JsonNode order : result.get("orders")) {
                long id = order.get("id").asLong();
                Map<String, Object> row = jdbc.queryForMap("SELECT o.SellerId, o.Subtotal, o.ShippingFee, o.TotalAmount, o.CommissionAmount, "
                        + "o.SellerPayoutTotal, q.Fee, q.Carrier, q.DistanceKm, q.IsSimulated, q.FormulaVersion, q.DeliveryZoneId "
                        + "FROM dbo.Orders o JOIN dbo.OrderShippingQuotes q ON q.OrderId = o.OrderId WHERE o.OrderId = ?", id);
                long subtotal = ((BigDecimal) row.get("Subtotal")).longValue();
                long fee = ((BigDecimal) row.get("ShippingFee")).longValue();
                long commission = Math.round(subtotal * 0.03);
                assertThat(fee).isEqualTo(((BigDecimal) row.get("Fee")).longValue());
                assertThat(fee).isEqualTo((Integer) row.get("SellerId") == sellerA ? grabFee : 0);
                assertThat(((BigDecimal) row.get("TotalAmount")).longValue()).isEqualTo(subtotal + fee);
                assertThat(((BigDecimal) row.get("CommissionAmount")).longValue()).as("commission excludes shipping").isEqualTo(commission);
                assertThat(((BigDecimal) row.get("SellerPayoutTotal")).longValue()).as("shipping goes to the seller").isEqualTo(subtotal - commission + fee);
                assertThat(row.get("IsSimulated")).isEqualTo(true);
                assertThat(row.get("FormulaVersion")).isEqualTo(FORMULA);
                assertThat(row.get("DeliveryZoneId")).isEqualTo(cauGiay);
                JsonNode shipping = getJson("/api/orders/" + id, buyerToken).get("shipping");
                assertThat(shipping.get("source").asText()).isEqualTo("SIMULATED_QUOTE");
                assertThat(shipping.get("fee").asLong()).isEqualTo(fee);
                assertThat(shipping.get("deliveryZone").get("code").asText()).isEqualTo("HN-CAU-GIAY");
                assertThat(shipping.get("simulated").asBoolean()).isTrue();
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.CartItems WHERE UserId = ? AND ProductId IN (?, ?)", Integer.class, buyer, a, c)).isZero();
        }

        @Test
        void badOrStaleQuotesAreRefusedAndNothingIsCreated() throws Exception {
            int item = listing(sellerA, "Tamper target", 70_000);
            int other = listing(sellerA, "Tamper second", 10_000);
            JsonNode groupA = group(readTree(quote(buyerToken, List.of(item), cauGiay).andReturn().getResponse().getContentAsString()), sellerA);
            JsonNode standard = option(groupA, "STANDARD_SIM");
            String good = standard.get("quoteToken").asText();
            long fee = standard.get("fee").asLong();
            int tenths = groupA.get("distanceKm").decimalValue().movePointRight(1).intValueExact();

            // Signature, payload, buyer, carrier and product-set tampering: 400 SHIPPING_QUOTE_INVALID.
            String[] parts = good.split("\\.");
            String badSignature = parts[0] + "." + parts[1] + "." + (parts[2].charAt(0) == 'A' ? "B" : "A") + parts[2].substring(1);
            String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            String cheaperPayload = payload.replace("|" + fee + "|" + FORMULA, "|0|" + FORMULA);
            assertThat(cheaperPayload).isNotEqualTo(payload);
            String cheaper = parts[0] + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(cheaperPayload.getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", badSignature)),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", cheaper)),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", "garbage")),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(strangerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good)),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "GRAB_EXPRESS_SIM", "quoteToken", good)),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(buyerToken, List.of(item, other), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good)),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(buyerToken, List.of(item), hoaLac, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good)),
                    HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            // An extra choice for a seller that is not in the checkout, or no choice at all.
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good),
                    Map.of("sellerId", sellerC, "carrier", "STANDARD_SIM", "quoteToken", good)), HttpStatus.BAD_REQUEST, "SHIPPING_QUOTE_INVALID", item);
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(), HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", item);
            // Unknown delivery area.
            quote(buyerToken, List.of(item), 999_999).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_ZONE"));
            expectRefused(buyerToken, List.of(item), 999_999, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good)),
                    HttpStatus.BAD_REQUEST, "INVALID_ZONE", item);

            // Correctly signed but expired, or with an amount the server does not compute now: 409 SHIPPING_QUOTE_CHANGED.
            String expired = tokens.sign(new QuoteTokens.Claims(buyer, sellerA, List.of(item), hoaLac, cauGiay, "STANDARD_SIM", tenths, fee,
                    FORMULA, Instant.now().minusSeconds(1)));
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", expired)),
                    HttpStatus.CONFLICT, "SHIPPING_QUOTE_CHANGED", item);
            String wrongFee = tokens.sign(new QuoteTokens.Claims(buyer, sellerA, List.of(item), hoaLac, cauGiay, "STANDARD_SIM", tenths, fee - 1000,
                    FORMULA, Instant.now().plusSeconds(600)));
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", wrongFee)),
                    HttpStatus.CONFLICT, "SHIPPING_QUOTE_CHANGED", item);
            String oldFormula = tokens.sign(new QuoteTokens.Claims(buyer, sellerA, List.of(item), hoaLac, cauGiay, "STANDARD_SIM", tenths, fee,
                    "SIM-2025-01", Instant.now().plusSeconds(600)));
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", oldFormula)),
                    HttpStatus.CONFLICT, "SHIPPING_QUOTE_CHANGED", item);
            // The seller moves the pickup area after the quote: recomputation differs.
            jdbc.update("UPDATE dbo.Products SET PickupZoneId = ? WHERE ProductId = ?", zone("HN-HA-DONG"), item);
            expectRefused(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good)),
                    HttpStatus.CONFLICT, "SHIPPING_QUOTE_CHANGED", item);
            jdbc.update("UPDATE dbo.Products SET PickupZoneId = NULL WHERE ProductId = ?", item);
            // The genuine token still works afterwards.
            checkout(buyerToken, List.of(item), cauGiay, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", good)))
                    .andExpect(status().isCreated());
            assertThat(jdbc.queryForObject("SELECT o.ShippingFee FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId = o.OrderId WHERE i.ProductId = ?",
                    BigDecimal.class, item)).isEqualByComparingTo(BigDecimal.valueOf(fee));
        }

        @Test
        void deliveryBeyondEveryCarrierIsUnavailable() throws Exception {
            int item = listing(sellerA, "Hoa Lac to Ben Thanh", 60_000);
            JsonNode groupA = group(readTree(quote(buyerToken, List.of(item), benThanh).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString()), sellerA);
            assertThat(groupA.get("available").asBoolean()).isFalse();
            assertThat(groupA.get("reason").asText()).isEqualTo("OUT_OF_RANGE");
            groupA.get("options").forEach(o -> {
                assertThat(o.get("available").asBoolean()).isFalse();
                assertThat(o.has("quoteToken")).isFalse();
            });
            int tenths = groupA.get("distanceKm").decimalValue().movePointRight(1).intValueExact();
            assertThat(tenths).isGreaterThan(ShippingCalculator.Carrier.STANDARD_SIM.maxTenths());
            String forged = tokens.sign(new QuoteTokens.Claims(buyer, sellerA, List.of(item), hoaLac, benThanh, "STANDARD_SIM", tenths, 0,
                    FORMULA, Instant.now().plusSeconds(600)));
            expectRefused(buyerToken, List.of(item), benThanh, List.of(Map.of("sellerId", sellerA, "carrier", "STANDARD_SIM", "quoteToken", forged)),
                    HttpStatus.CONFLICT, "SHIPPING_UNAVAILABLE", item);
        }

        @Test
        void quotesNeedASignedInBuyerAndPurchasableListings() throws Exception {
            int item = listing(sellerA, "Quote rules", 20_000);
            mvc.perform(post("/api/shipping/quotes").contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(Map.of("productIds", List.of(item), "deliveryZoneId", cauGiay)))).andExpect(status().isUnauthorized());
            quote(sellerAToken, List.of(item), cauGiay).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OWN_LISTING"));
            jdbc.update("UPDATE dbo.Products SET Status = 'Reserved' WHERE ProductId = ?", item);
            quote(buyerToken, List.of(item), cauGiay).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_UNAVAILABLE"));
            jdbc.update("UPDATE dbo.Products SET Status = 'Available' WHERE ProductId = ?", item);
        }

        @Test
        void legacyOrdersShowTheirStoredFeeWithoutAQuote() throws Exception {
            long legacy = jdbc.queryForObject("SELECT MIN(o.OrderId) FROM dbo.Orders o WHERE NOT EXISTS "
                    + "(SELECT 1 FROM dbo.OrderShippingQuotes q WHERE q.OrderId = o.OrderId)", Long.class);
            BigDecimal stored = jdbc.queryForObject("SELECT ShippingFee FROM dbo.Orders WHERE OrderId = ?", BigDecimal.class, legacy);
            JsonNode shipping = getJson("/api/orders/" + legacy, adminToken).get("shipping");
            assertThat(shipping.get("source").asText()).isEqualTo("LEGACY");
            assertThat(shipping.get("fee").asLong()).isEqualTo(stored.longValue());
            assertThat(shipping.has("carrier")).isFalse();
        }

        @Test
        void twoBuyersRacingForListingsOfTwoSellers() throws Exception {
            int shared = listing(sellerA, "Race shared", 30_000);
            int c1 = listingAtZone(sellerC, "Race C one", 20_000, cauGiay);
            int c2 = listingAtZone(sellerC, "Race C two", 25_000, cauGiay);
            String other = token(newUser("Student", "V003 Racer", true));
            String mine = checkoutBody(buyerToken, List.of(shared, c1), cauGiay);
            String theirs = checkoutBody(other, List.of(shared, c2), cauGiay);
            List<ResponseEntity<String>> results = race(() -> restCheckout(buyerToken, mine), () -> restCheckout(other, theirs));
            assertThat(results.stream().filter(r -> r.getStatusCode() == HttpStatus.CREATED)).hasSize(1);
            assertThat(results.stream().filter(r -> r.getStatusCode() == HttpStatus.CONFLICT)).hasSize(1);
            boolean firstWon = results.get(0).getStatusCode() == HttpStatus.CREATED;
            int loserC = firstWon ? c2 : c1;
            assertThat(productStatus(shared)).isEqualTo("Reserved");
            assertThat(productStatus(loserC)).as("the loser's other seller order was rolled back too").isEqualTo("Available");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderItems WHERE ProductId = ?", Integer.class, loserC)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderShippingQuotes q WHERE NOT EXISTS "
                    + "(SELECT 1 FROM dbo.OrderItems i WHERE i.OrderId = q.OrderId)", Integer.class)).as("no orphan quote").isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId = o.OrderId "
                    + "WHERE i.ProductId IN (?, ?, ?) AND NOT EXISTS (SELECT 1 FROM dbo.OrderShippingQuotes q WHERE q.OrderId = o.OrderId)",
                    Integer.class, shared, c1, c2)).as("every order created through the API has its quote").isZero();
        }
    }

    // ================================================================== simulated Bank QR

    @Nested
    class BankQr {

        @Test
        void aBankQrAttemptShowsALabelledDemoQrAndIsPaidOnlyAfterVerification() throws Exception {
            long id = confirmedOrder("BankQR success", 80_000, "BANK_QR");
            long total = jdbc.queryForObject("SELECT TotalAmount FROM dbo.Orders WHERE OrderId = ?", BigDecimal.class, id).longValue();
            JsonNode attempt = readJson(mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"BANK_QR\"}")).andExpect(status().isCreated()));
            assertThat(attempt.get("provider").asText()).isEqualTo("BANK_QR");
            assertThat(attempt.get("amount").asLong()).isEqualTo(total);
            JsonNode qr = attempt.get("bankQr");
            assertThat(qr.get("simulated").asBoolean()).isTrue();
            assertThat(qr.get("amount").asLong()).isEqualTo(total);
            assertThat(qr.get("qrPayload").asText()).startsWith("UNIMARKET-SIMULATED-PAYMENT|").endsWith("|NOT-A-BANK-QR")
                    .doesNotStartWith("000201").contains("amount=" + total);
            assertThat(qr.get("notice").asText()).contains("SIMULATED").contains("do not transfer");
            assertThat(attempt.toString()).doesNotContain("UMK-");
            assertThat(orderStatus(id)).as("showing the QR changes nothing").isEqualTo("AwaitingPayment");
            JsonNode order = complete(attempt.get("paymentId").asLong(), buyerToken, "SUCCESS").andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString().transform(V003IntegrationTest.this::readTree);
            assertThat(order.get("status").asText()).isEqualTo("PAID");
            assertThat(order.get("paymentProvider").asText()).isEqualTo("BANK_QR");
            assertThat(jdbc.queryForObject("SELECT Provider FROM dbo.Payments WHERE OrderId = ? AND Status = 'Succeeded'", String.class, id)).isEqualTo("BankQR");
        }

        @Test
        void aFailedBankQrPaymentLeavesTheOrderUnpaid() throws Exception {
            long id = confirmedOrder("BankQR failure", 40_000, "BANK_QR");
            JsonNode attempt = startPayment(id, "BANK_QR");
            complete(attempt.get("paymentId").asLong(), buyerToken, "FAILURE").andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"));
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Payments WHERE OrderId = ?", String.class, id)).isEqualTo("Failed");
        }

        @Test
        void bankQrNotificationsMustBeSignedExactAndUnique() throws Exception {
            long id = confirmedOrder("BankQR callbacks", 50_000, "BANK_QR");
            startPayment(id, "BANK_QR");
            long total = jdbc.queryForObject("SELECT TotalAmount FROM dbo.Orders WHERE OrderId = ?", BigDecimal.class, id).longValue();
            String key = requestKey(id);
            PaymentResultService.PaymentNotification good = new PaymentResultService.PaymentNotification(key, "SIM-qr-" + UUID.randomUUID(), total, true, "BANK_QR");
            assertThat(callback(good, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(callback(good, "00".repeat(32)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            PaymentResultService.PaymentNotification less = new PaymentResultService.PaymentNotification(key, good.providerReference(), total - 1_000, true, "BANK_QR");
            assertThat(callback(less, simulator.sign(good)).getStatusCode()).as("signature of other content").isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(callback(less, simulator.sign(less)).getBody()).as("wrong amount").contains("PAYMENT_MISMATCH");
            PaymentResultService.PaymentNotification momo = new PaymentResultService.PaymentNotification(key, "SIM-m-" + UUID.randomUUID(), total, true, "MOMO");
            assertThat(callback(momo, simulator.sign(momo)).getBody()).as("wrong provider").contains("PAYMENT_MISMATCH");
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
            assertThat(callback(good, simulator.sign(good)).getBody()).contains("RECORDED").contains("PAID");
            assertThat(callback(good, simulator.sign(good)).getBody()).contains("DUPLICATE_IGNORED");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Payments WHERE OrderId = ? AND Status = 'Succeeded'", Integer.class, id)).isEqualTo(1);
        }

        @Test
        void bankQrFollowsTheDeadlineAndGraceRules() throws Exception {
            long inGrace = confirmedOrder("BankQR grace", 30_000, "BANK_QR");
            startPayment(inGrace, "BANK_QR");
            moveOrderBack(inGrace, 24 * 60 + 10);
            movePaymentBack(inGrace, 24 * 60 + 20);
            assertThat(expiry.expireOverdueOrders()).noneMatch(e -> e.orderId() == inGrace);
            complete(paymentId(inGrace), buyerToken, "SUCCESS").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));

            long late = confirmedOrder("BankQR late", 30_000, "BANK_QR");
            startPayment(late, "BANK_QR");
            moveOrderBack(late, 24 * 60 + 60);
            movePaymentBack(late, 24 * 60 + 70);
            long total = jdbc.queryForObject("SELECT TotalAmount FROM dbo.Orders WHERE OrderId = ?", BigDecimal.class, late).longValue();
            PaymentResultService.PaymentNotification success = new PaymentResultService.PaymentNotification(requestKey(late), "SIM-late-" + UUID.randomUUID(), total, true, "BANK_QR");
            assertThat(callback(success, simulator.sign(success)).getBody()).contains("PAYMENT_TOO_LATE");
            assertThat(expiry.expireOverdueOrders()).anyMatch(e -> e.orderId() == late);
            assertThat(orderStatus(late)).isEqualTo("Cancelled");
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Payments WHERE OrderId = ?", String.class, late)).isEqualTo("Expired");
        }

        @Test
        void onlyTheBuyerCanFinishTheSimulatedQrAndNothingMarksItPaidDirectly() throws Exception {
            long id = confirmedOrder("BankQR authz", 30_000, "BANK_QR");
            long paymentId = startPayment(id, "BANK_QR").get("paymentId").asLong();
            for (String path : List.of("mark-paid", "pay", "paid", "bank-qr/confirm")) {
                mvc.perform(post("/api/orders/" + id + "/" + path).header("Authorization", bearer(buyerToken))).andExpect(status().isNotFound());
            }
            complete(paymentId, strangerToken, "SUCCESS").andExpect(status().isNotFound());
            complete(paymentId, sellerAToken, "SUCCESS").andExpect(status().isForbidden());   // the seller is not the payer
            mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isUnauthorized());
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
        }

        @Test
        void momoAndZaloPayStillWork() throws Exception {
            for (String provider : List.of("MOMO", "ZALOPAY")) {
                long id = confirmedOrder("Regression " + provider, 25_000, provider);
                JsonNode attempt = startPayment(id, provider);
                assertThat(attempt.get("provider").asText()).isEqualTo(provider);
                assertThat(attempt.has("bankQr")).isFalse();
                complete(attempt.get("paymentId").asLong(), buyerToken, "SUCCESS").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
            }
        }

        @Test
        void promotionsCanBePaidWithTheSimulatedBankQr() throws Exception {
            int item = listing(sellerA, "BankQR promoted listing", 90_000);
            int packageId = jdbc.queryForObject("SELECT MIN(PackageId) FROM dbo.PromotionPackages", Integer.class);
            mvc.perform(post("/api/products/" + item + "/promotions").header("Authorization", bearer(sellerAToken)).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(Map.of("packageId", packageId, "provider", "BANK_QR")))).andExpect(status().is2xxSuccessful());
            assertThat(jdbc.queryForObject("SELECT TOP 1 Provider FROM dbo.ProductPromotions WHERE ProductId = ? ORDER BY PromotionId DESC", String.class, item))
                    .isEqualTo("BankQR");
        }
    }

    // ================================================================== helpers

    private List<Integer> catalogIds(String query) throws Exception {
        List<Integer> ids = new java.util.ArrayList<>();
        publicJson("/api/products?size=50&" + query).get("items").forEach(item -> ids.add(item.get("id").asInt()));
        return ids;
    }

    /** A public GET without any Authorization header. */
    private JsonNode publicJson(String url) throws Exception {
        return readJson(mvc.perform(get(url)).andExpect(status().isOk()));
    }

    /** Province names have accents: sent as a request parameter (encoded by MockMvc), not inside the URL template. */
    private List<Integer> provinceIds(String keyword, String province) throws Exception {
        List<Integer> ids = new java.util.ArrayList<>();
        readJson(mvc.perform(get("/api/products").param("q", keyword).param("province", province).param("size", "50"))
                .andExpect(status().isOk())).get("items").forEach(item -> ids.add(item.get("id").asInt()));
        return ids;
    }

    private int zone(String code) {
        return jdbc.queryForObject("SELECT ZoneId FROM dbo.LocationZones WHERE Code = ?", Integer.class, code);
    }

    private static String newEmail() {
        return "v3-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16) + "@gmail.com";
    }

    /** @param withCampus true: official campus 1; false: no campus, self-declared "Đại học Cần Thơ" */
    private int newUser(String role, String name, boolean withCampus) {
        String email = newEmail();
        jdbc.update("INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, DeclaredUniversityName, Role, Status, EmailVerifiedAt) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'Active', SYSUTCDATETIME())", email, passwordEncoder.encode("Secret123"), name,
                withCampus ? 1 : null, withCampus ? null : "Đại học Cần Thơ", role);
        return jdbc.queryForObject("SELECT UserId FROM dbo.Users WHERE Email = ?", Integer.class, email);
    }

    private String token(int userId) throws Exception {
        String email = jdbc.queryForObject("SELECT Email FROM dbo.Users WHERE UserId = ?", String.class, userId);
        return readJson(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", "Secret123")))).andExpect(status().isOk()))
                .get("accessToken").asText();
    }

    /** Approved listing at campus 1 (area HN-HOA-LAC). */
    private int listing(int sellerId, String title, long price) {
        return jdbc.queryForObject("INSERT dbo.Products (SellerId, CategoryId, CampusId, Title, Description, Condition, Price, Status, ModerationStatus) "
                        + "OUTPUT inserted.ProductId VALUES (?, 1, 1, ?, N'A clean, well kept item from a student.', 'Used', ?, 'Available', 'Approved')",
                Integer.class, sellerId, title, price);
    }

    /** Approved listing without a campus, located by its pickup area only (V003). */
    private int listingAtZone(int sellerId, String title, long price, int zoneId) {
        return jdbc.queryForObject("INSERT dbo.Products (SellerId, CategoryId, CampusId, PickupZoneId, Title, Description, Condition, Price, Status, ModerationStatus) "
                        + "OUTPUT inserted.ProductId VALUES (?, 1, NULL, ?, ?, N'A clean, well kept item from a student.', 'Used', ?, 'Available', 'Approved')",
                Integer.class, sellerId, zoneId, title, price);
    }

    private ResultActions editListing(String token, int productId, Integer campusId, Integer pickupZoneId) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Edited V003 listing");
        body.put("description", "A clean, well kept item from a student.");
        body.put("price", 41_000);
        body.put("condition", "USED");
        body.put("categoryId", 1);
        body.put("campusId", campusId);
        body.put("pickupZoneId", pickupZoneId);
        return mvc.perform(put("/api/products/" + productId).header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private ResultActions register(Map<String, Object> body) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private ResultActions quote(String token, List<Integer> ids, int deliveryZoneId) throws Exception {
        return mvc.perform(post("/api/shipping/quotes").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("productIds", ids, "deliveryZoneId", deliveryZoneId))));
    }

    private static JsonNode group(JsonNode quote, int sellerId) {
        for (JsonNode group : quote.get("groups")) {
            if (group.get("sellerId").asInt() == sellerId) {
                return group;
            }
        }
        throw new AssertionError("no group for seller " + sellerId + ": " + quote);
    }

    private static JsonNode option(JsonNode group, String carrier) {
        for (JsonNode option : group.get("options")) {
            if (carrier.equals(option.get("carrier").asText())) {
                return option;
            }
        }
        throw new AssertionError("no option " + carrier);
    }

    private static Map<String, Object> choice(int sellerId, String carrier, JsonNode option) {
        return Map.of("sellerId", sellerId, "carrier", carrier, "quoteToken", option.get("quoteToken").asText());
    }

    private String body(List<Integer> ids, int deliveryZoneId, List<Map<String, Object>> shipping, String provider) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productIds", ids);
        body.put("recipientName", "V003 Buyer");
        body.put("recipientPhone", "0912345678");
        body.put("deliveryAddress", "Dormitory C, room 12");
        body.put("paymentProvider", provider);
        body.put("deliveryZoneId", deliveryZoneId);
        body.put("shipping", shipping);
        body.put("deliveryLatitude", new java.math.BigDecimal("21.036200"));
        body.put("deliveryLongitude", new java.math.BigDecimal("105.790500"));
        return json.writeValueAsString(body);
    }

    private ResultActions checkout(String token, List<Integer> ids, int deliveryZoneId, List<Map<String, Object>> shipping) throws Exception {
        return mvc.perform(post("/api/checkout").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(body(ids, deliveryZoneId, shipping, "MOMO")));
    }

    /** Quote as this buyer, STANDARD_SIM for every seller. */
    private String checkoutBody(String token, List<Integer> ids, int deliveryZoneId) throws Exception {
        JsonNode quote = readTree(quote(token, ids, deliveryZoneId).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        List<Map<String, Object>> shipping = new ArrayList<>();
        quote.get("groups").forEach(g -> shipping.add(choice(g.get("sellerId").asInt(), "STANDARD_SIM", option(g, "STANDARD_SIM"))));
        return body(ids, deliveryZoneId, shipping, "MOMO");
    }

    private void expectRefused(String token, List<Integer> ids, int deliveryZoneId, List<Map<String, Object>> shipping,
                               HttpStatus status, String code, int item) throws Exception {
        long ordersBefore = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders", Long.class);
        long quotesBefore = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderShippingQuotes", Long.class);
        checkout(token, ids, deliveryZoneId, shipping).andExpect(status().is(status.value())).andExpect(jsonPath("$.code").value(code));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders", Long.class)).isEqualTo(ordersBefore);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderShippingQuotes", Long.class)).isEqualTo(quotesBefore);
        assertThat(productStatus(item)).isEqualTo("Available");
    }

    /** A confirmed (AwaitingPayment) order of seller A for the buyer, with the given payment provider chosen at checkout. */
    private long confirmedOrder(String title, long price, String provider) throws Exception {
        int item = listing(sellerA, title, price);
        String body = checkoutBody(buyerToken, List.of(item), cauGiay).replace("\"paymentProvider\":\"MOMO\"", "\"paymentProvider\":\"" + provider + "\"");
        long id = readJson(mvc.perform(post("/api/checkout").header("Authorization", bearer(buyerToken)).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isCreated())).get("orders").get(0).get("id").asLong();
        mvc.perform(post("/api/orders/" + id + "/confirm").header("Authorization", bearer(sellerAToken))).andExpect(status().isOk());
        return id;
    }

    private JsonNode startPayment(long orderId, String provider) throws Exception {
        return readJson(mvc.perform(post("/api/orders/" + orderId + "/payments").header("Authorization", bearer(buyerToken))
                .contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"" + provider + "\"}")).andExpect(status().isCreated()));
    }

    private ResultActions complete(long paymentId, String token, String outcome) throws Exception {
        return mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"" + outcome + "\"}"));
    }

    private ResponseEntity<String> callback(PaymentResultService.PaymentNotification notification, String signature) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (signature != null) {
            headers.set("X-Simulator-Signature", signature);
        }
        return rest.exchange("/api/dev/payment-simulator/callback", HttpMethod.POST,
                new HttpEntity<>(json.writeValueAsString(notification), headers), String.class);
    }

    private long paymentId(long orderId) {
        return jdbc.queryForObject("SELECT TOP 1 PaymentId FROM dbo.Payments WHERE OrderId = ? ORDER BY PaymentId DESC", Long.class, orderId);
    }

    private String requestKey(long orderId) {
        return jdbc.queryForObject("SELECT TOP 1 RequestKey FROM dbo.Payments WHERE OrderId = ? ORDER BY PaymentId DESC", String.class, orderId);
    }

    private void moveOrderBack(long orderId, int minutes) {
        jdbc.update("UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -?, CreatedAt), ConfirmBy = DATEADD(minute, -?, ConfirmBy), "
                + "ConfirmedAt = DATEADD(minute, -?, ConfirmedAt), PaidAt = DATEADD(minute, -?, PaidAt) WHERE OrderId = ?",
                minutes, minutes, minutes, minutes, orderId);
    }

    private void movePaymentBack(long orderId, int minutes) {
        jdbc.update("UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -?, CreatedAt) WHERE OrderId = ? AND Status = 'Pending'", minutes, orderId);
    }

    private String orderStatus(long orderId) {
        return jdbc.queryForObject("SELECT Status FROM dbo.Orders WHERE OrderId = ?", String.class, orderId);
    }

    private String productStatus(int productId) {
        return jdbc.queryForObject("SELECT Status FROM dbo.Products WHERE ProductId = ?", String.class, productId);
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private JsonNode getJson(String url, String token) throws Exception {
        return readJson(mvc.perform(get(url).header("Authorization", bearer(token))).andExpect(status().isOk()));
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode readTree(String content) {
        try {
            return json.readTree(content);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private HttpHeaders jsonHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return headers;
    }

    private ResponseEntity<String> restCheckout(String token, String body) {
        return rest.exchange("/api/checkout", HttpMethod.POST, new HttpEntity<>(body, jsonHeaders(token)), String.class);
    }

    @SafeVarargs
    private List<ResponseEntity<String>> race(Callable<ResponseEntity<String>>... calls) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(calls.length);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<ResponseEntity<String>>> futures = new ArrayList<>();
            for (Callable<ResponseEntity<String>> call : calls) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return call.call();
                }));
            }
            start.countDown();
            List<ResponseEntity<String>> results = new ArrayList<>();
            for (Future<ResponseEntity<String>> future : futures) {
                results.add(future.get());
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private String demoChecksum() {
        return new HashMap<>(jdbc.queryForMap("SELECT "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(UserId, Email, PasswordHash, FullName, Role, Status, EmailVerifiedAt, UpdatedAt)) FROM dbo.Users WHERE UserId <= 17) AS users, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, Title, Price, Status, ModerationStatus, UpdatedAt)) FROM dbo.Products WHERE ProductId <= 50) AS products, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(OrderId, BuyerId, SellerId, Status, Subtotal, ShippingFee, ConfirmedAt, PaidAt, CompletedAt, CancelledAt)) FROM dbo.Orders WHERE OrderId <= 12) AS orders, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(PaymentId, OrderId, Status, Amount, ProviderReference)) FROM dbo.Payments WHERE OrderId <= 12) AS payments, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(OrderId, Status, Amount, PayoutReference)) FROM dbo.SellerSettlements WHERE OrderId <= 12) AS settlements, "
                + "(SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE OrderId <= 12) AS history, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(UserId, ProductId)) FROM dbo.CartItems WHERE UserId <= 17) AS carts")).toString();
    }
}
