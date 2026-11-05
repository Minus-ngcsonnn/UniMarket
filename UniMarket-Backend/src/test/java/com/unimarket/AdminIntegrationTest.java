package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.service.order.PaymentResultService;
import com.unimarket.service.order.PaymentSimulator;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Stage 5 end-to-end tests: admin moderation, accounts, reviews, reports, disputes, settlements, promotions, dashboard
 * and contact settings, against a real SQL Server database and the real V002 procedures.
 *
 * <p>Writes data: runs only with {@code UNIMARKET_WRITE_IT=true} and refuses any database whose name does not contain
 * "Test". Test accounts, listings and orders are created here; demo rows are only read and compared before and after.</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_WRITE_IT", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"unimarket.payment.simulator.enabled=true"})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdminIntegrationTest {

    /** V003: listings at campus 1 (HN-HOA-LAC) delivered to HN-CAU-GIAY with STANDARD_SIM; fee read from the quote. */
    private long FEE;
    private int deliveryZone;
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

    @Autowired private MockMvc mvc;
    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private PaymentSimulator simulator;

    private String demoChecksum;
    private int adminId;
    private int sellerId;
    private int buyerId;
    private String admin;
    private String admin2;
    private String seller;
    private String buyer;
    private String stranger;

    @DynamicPropertySource
    static void uploads(DynamicPropertyRegistry registry) throws IOException {
        String dir = Files.createTempDirectory("unimarket-admin-test-uploads").toString();
        registry.add("unimarket.storage.upload-dir", () -> dir);
    }

    @BeforeAll
    void setUp() throws Exception {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
        demoChecksum = demoChecksum();
        deliveryZone = jdbc.queryForObject("SELECT ZoneId FROM dbo.LocationZones WHERE Code = 'HN-CAU-GIAY'", Integer.class);
        adminId = newUser("Admin", "Stage5 Admin");
        admin = token(adminId);
        admin2 = token(newUser("Admin", "Stage5 Second Admin"));
        sellerId = newUser("Student", "Stage5 Seller");
        seller = token(sellerId);
        buyerId = newUser("Student", "Stage5 Buyer");
        buyer = token(buyerId);
        stranger = token(newUser("Student", "Stage5 Stranger"));
    }

    @AfterAll
    void demoDataUnchanged() {
        assertThat(demoChecksum()).as("demo rows must not change").isEqualTo(demoChecksum);
    }

    // ================================================================== moderation (first priority)

    @Nested
    class Moderation {

        @Test
        void sellerCreatesAdminApprovesAndTheListingBecomesPublicAndPurchasable() throws Exception {
            JsonNode created = readJson(mvc.perform(multipart("/api/products")
                            .file(new MockMultipartFile("listing", "", "application/json", listingJson("Approval flow lamp", 120_000).getBytes(StandardCharsets.UTF_8)))
                            .file(new MockMultipartFile("photos", "a.png", "image/png", PNG)).header("Authorization", bearer(seller)))
                    .andExpect(status().isCreated()).andExpect(jsonPath("$.moderation").value("PENDING")));
            int id = created.get("id").asInt();
            mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
            assertThat(allIds("/api/admin/listings?moderation=PENDING", admin, "id")).contains((long) id);
            JsonNode detail = getJson("/api/admin/listings/" + id, admin);
            assertThat(detail.get("images")).hasSize(1);
            assertThat(detail.get("version").asText()).hasSize(16);
            JsonNode approved = readJson(approve(admin, id, detail.get("version").asText()).andExpect(status().isOk()));
            assertThat(approved.get("moderation").asText()).isEqualTo("APPROVED");
            assertThat(approved.get("history").get(0).get("action").asText()).isEqualTo("APPROVED");
            mvc.perform(get("/api/products/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.purchasable").value(true));
            assertThat(ids(getJson("/api/products?size=50&sellerId=" + sellerId, null))).contains((long) id);
            long orderId = checkout(buyer, id);
            assertThat(orderId).isPositive();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.AdminActions WHERE EntityType = 'Product' AND EntityId = ? AND Action = 'Approve listing'",
                    Integer.class, id)).isEqualTo(1);
        }

        @Test
        void onlyAdminsModerate() throws Exception {
            int id = pendingListing("Student cannot approve", 50_000);
            String version = version(id);
            approve(seller, id, version).andExpect(status().isForbidden());
            approve(buyer, id, version).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/listings/" + id + "/approve").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"" + version + "\"}")).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/admin/listings").header("Authorization", bearer(seller))).andExpect(status().isForbidden());
            assertThat(moderationOf(id)).isEqualTo("Pending");
        }

        @Test
        void anApprovalOfAnOutdatedVersionIsRefused() throws Exception {
            int id = approvedListingViaApi("Stale approval desk", 90_000);
            String reviewed = version(id);
            mvc.perform(put("/api/products/" + id).header("Authorization", bearer(seller)).contentType(MediaType.APPLICATION_JSON)
                    .content(listingJson("Stale approval desk (edited)", 80_000))).andExpect(status().isOk());
            assertThat(moderationOf(id)).as("an edit returns the listing to review").isEqualTo("Pending");
            approve(admin, id, reviewed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_CHANGED"));
            mvc.perform(post("/api/admin/listings/" + id + "/reject").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"" + reviewed + "\",\"reason\":\"Reason for the old version\"}"))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_CHANGED"));
            approve(admin, id, version(id)).andExpect(status().isOk());
            mvc.perform(get("/api/products/" + id)).andExpect(jsonPath("$.title").value("Stale approval desk (edited)"));
            approve(admin, id, version(id)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MODERATION_CONFLICT"));
            approve(admin, id, "xyz").andExpect(status().isBadRequest());
        }

        @Test
        void rejectionReasonIsShownToTheSellerWhoCanResubmit() throws Exception {
            int id = pendingListing("Rejected kettle", 40_000);
            mvc.perform(post("/api/admin/listings/" + id + "/reject").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"" + version(id) + "\",\"reason\":\"short\"}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/admin/listings/" + id + "/reject").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":\"" + version(id) + "\",\"reason\":\"Photos do not show the item.\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.moderation").value("BLOCKED"));
            mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
            JsonNode history = getJson("/api/me/products/" + id + "/moderation", seller);
            assertThat(history.get(0).get("action").asText()).isEqualTo("REJECTED");
            assertThat(history.get(0).get("reason").asText()).isEqualTo("Photos do not show the item.");
            assertThat(history.get(0).has("admin")).as("sellers do not see which admin decided").isFalse();
            mvc.perform(get("/api/me/products/" + id + "/moderation").header("Authorization", bearer(stranger))).andExpect(status().isNotFound());
            mvc.perform(put("/api/products/" + id).header("Authorization", bearer(seller)).contentType(MediaType.APPLICATION_JSON)
                    .content(listingJson("Rejected kettle, better photos", 40_000))).andExpect(status().isOk());
            assertThat(moderationOf(id)).isEqualTo("Pending");
        }

        @Test
        void approvalNeverMakesReservedSoldOrRemovedListingsPurchasable() throws Exception {
            for (String sale : List.of("Reserved", "Sold", "Removed")) {
                int id = pendingListing("Pending but " + sale, 30_000);
                jdbc.update("UPDATE dbo.Products SET Status = ? WHERE ProductId = ?", sale, id);
                approve(admin, id, version(id)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MODERATION_CONFLICT"));
                assertThat(moderationOf(id)).isEqualTo("Pending");
            }
            int draft = pendingListing("Pending draft", 30_000);
            jdbc.update("UPDATE dbo.Products SET Status = 'Draft' WHERE ProductId = ?", draft);
            approve(admin, draft, version(draft)).andExpect(status().isOk());
            mvc.perform(get("/api/products/" + draft)).andExpect(status().isNotFound());
        }

        @Test
        void blockAndRemoveViolatingListings() throws Exception {
            int id = approvedListingViaApi("Fake brand bag", 70_000);
            mvc.perform(post("/api/admin/listings/" + id + "/block").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Counterfeit brand item.\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.moderation").value("BLOCKED"));
            mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
            mvc.perform(post("/api/admin/listings/" + id + "/block").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Counterfeit brand item.\"}")).andExpect(status().isConflict());
            int removable = approvedListingViaApi("Prohibited item", 70_000);
            mvc.perform(post("/api/admin/listings/" + removable + "/remove").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Prohibited item category.\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REMOVED"));
            int inOrder = approvedListingViaApi("Reserved by an order", 70_000);
            checkout(buyer, inOrder);
            mvc.perform(post("/api/admin/listings/" + inOrder + "/remove").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Trying to remove a reserved listing.\"}")).andExpect(status().isConflict());
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Products WHERE ProductId = ?", String.class, inOrder)).isEqualTo("Reserved");
        }

        @Test
        void twoAdminsApprovingAtOnceRecordOneDecision() throws Exception {
            int id = pendingListing("Concurrent approval", 30_000);
            String v = version(id);
            List<ResponseEntity<String>> results = race(
                    () -> rest.exchange("/api/admin/listings/" + id + "/approve", HttpMethod.POST, new HttpEntity<>("{\"version\":\"" + v + "\"}", headers(admin)), String.class),
                    () -> rest.exchange("/api/admin/listings/" + id + "/approve", HttpMethod.POST, new HttpEntity<>("{\"version\":\"" + v + "\"}", headers(admin2)), String.class));
            assertThat(results.stream().filter(r -> r.getStatusCode() == HttpStatus.OK)).hasSize(1);
            assertThat(results.stream().filter(r -> r.getStatusCode() == HttpStatus.CONFLICT)).hasSize(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.AdminActions WHERE EntityType = 'Product' AND EntityId = ?", Integer.class, id)).isEqualTo(1);
        }
    }

    // ================================================================== users

    @Nested
    class Users {

        @Test
        void listSearchAndSafeDetails() throws Exception {
            String email = jdbc.queryForObject("SELECT Email FROM dbo.Users WHERE UserId = ?", String.class, sellerId);
            JsonNode found = getJson("/api/admin/users?q=" + email.substring(0, 15), admin);
            assertThat(ids(found)).contains((long) sellerId);
            JsonNode detail = getJson("/api/admin/users/" + sellerId, admin);
            assertThat(detail.get("role").asText()).isEqualTo("STUDENT");
            assertThat(detail.get("emailVerified").asBoolean()).isTrue();
            assertThat(detail.toString().toLowerCase()).doesNotContain("passwordhash").doesNotContain("$2a$").doesNotContain("verifiedstudent");
            assertThat(getJson("/api/admin/users?status=SUSPENDED&size=100", admin).get("items").findValuesAsText("status")).allMatch("SUSPENDED"::equals);
            mvc.perform(get("/api/admin/users?status=BANNED").header("Authorization", bearer(admin))).andExpect(status().isBadRequest());
            mvc.perform(get("/api/admin/users").header("Authorization", bearer(buyer))).andExpect(status().isForbidden());
        }

        @Test
        void privateContactNeedsAPurposeAndEveryAccessIsAudited() throws Exception {
            int userId = newUser("Student", "Private contact owner");
            jdbc.update("UPDATE dbo.Users SET Phone = '0912000111', ZaloUrl = N'https://zalo.me/0912000111', ShowContact = 0 WHERE UserId = ?", userId);
            mvc.perform(get("/api/admin/users/" + userId).header("Authorization", bearer(admin)))
                    .andExpect(jsonPath("$.showContact").value(false)).andExpect(jsonPath("$.phone").doesNotExist())
                    .andExpect(jsonPath("$.zaloUrl").doesNotExist());
            mvc.perform(get("/api/users/" + userId)).andExpect(jsonPath("$.contact").doesNotExist());
            mvc.perform(post("/api/admin/users/" + userId + "/contact-access").header("Authorization", bearer(admin))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"purpose\":\"short\"}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/admin/users/" + userId + "/contact-access").header("Authorization", bearer(buyer))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"purpose\":\"I want this phone number\"}")).andExpect(status().isForbidden());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.AdminActions WHERE EntityType = 'User' AND EntityId = ?", Integer.class, userId)).isZero();
            mvc.perform(post("/api/admin/users/" + userId + "/contact-access").header("Authorization", bearer(admin))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"purpose\":\"Dispute 7: buyer cannot reach the seller\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.phone").value("0912000111")).andExpect(jsonPath("$.showContact").value(false));
            Map<String, Object> audit = jdbc.queryForMap("SELECT AdminId, Action, Reason FROM dbo.AdminActions WHERE EntityType = 'User' AND EntityId = ?", userId);
            assertThat(audit).containsEntry("AdminId", adminId).containsEntry("Action", "View private contact")
                    .containsEntry("Reason", "Dispute 7: buyer cannot reach the seller");
            mvc.perform(get("/api/admin/users/" + userId).header("Authorization", bearer(admin)))
                    .andExpect(jsonPath("$.history[0].action").value("PRIVATE_CONTACT_VIEWED"));
        }

        @Test
        void suspensionBlocksAccessImmediatelyAndKeepsHistory() throws Exception {
            int userId = newUser("Student", "Suspend me");
            String token = token(userId);
            int listing = approvedListing(userId, "Suspended seller item", 30_000);
            long ordersBefore = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders WHERE BuyerId = ? OR SellerId = ?", Long.class, userId, userId);
            mvc.perform(post("/api/admin/users/" + userId + "/suspend").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"short\"}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/admin/users/" + userId + "/suspend").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Asked buyers to pay outside UniMarket.\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUSPENDED"));
            mvc.perform(get("/api/auth/me").header("Authorization", bearer(token))).andExpect(status().isUnauthorized());
            assertThat(ids(getJson("/api/products?size=50&sellerId=" + userId, null))).doesNotContain((long) listing);
            mvc.perform(post("/api/admin/users/" + userId + "/suspend").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Asked buyers to pay outside UniMarket.\"}")).andExpect(status().isConflict());
            mvc.perform(post("/api/admin/users/" + userId + "/reactivate").header("Authorization", bearer(admin))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.history.length()").value(2));
            mvc.perform(get("/api/auth/me").header("Authorization", bearer(token))).andExpect(status().isOk());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders WHERE BuyerId = ? OR SellerId = ?", Long.class, userId, userId)).isEqualTo(ordersBefore);
        }

        @Test
        void adminsAndYourselfCannotBeSuspendedAndRolesCannotBeEscalated() throws Exception {
            int otherAdmin = jdbc.queryForObject("SELECT MIN(UserId) FROM dbo.Users WHERE Role = 'Admin'", Integer.class);
            mvc.perform(post("/api/admin/users/" + otherAdmin + "/suspend").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Trying to suspend an admin.\"}")).andExpect(status().isConflict());
            mvc.perform(post("/api/admin/users/" + adminId + "/suspend").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Trying to suspend myself.\"}")).andExpect(status().isConflict());
            mvc.perform(post("/api/admin/users/" + buyerId + "/suspend").header("Authorization", bearer(seller)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Students cannot do this.\"}")).andExpect(status().isForbidden());
            // Registration ignores any role in the request; there is no role-changing endpoint.
            String email = "it-reg-" + UUID.randomUUID().toString().substring(0, 8) + "@fpt.edu.vn";
            mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"fullName\":\"Wannabe Admin\",\"email\":\"" + email + "\",\"password\":\"Secret123\",\"campusId\":"
                            + jdbc.queryForObject("SELECT MIN(CampusId) FROM dbo.Campuses", Integer.class) + ",\"role\":\"Admin\"}"))
                    .andExpect(status().is2xxSuccessful());
            assertThat(jdbc.queryForObject("SELECT Role FROM dbo.Users WHERE Email = ?", String.class, email)).isEqualTo("Student");
            mvc.perform(put("/api/admin/users/" + buyerId + "/role").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"role\":\"ADMIN\"}")).andExpect(status().is4xxClientError());
            assertThat(jdbc.queryForObject("SELECT Role FROM dbo.Users WHERE UserId = ?", String.class, buyerId)).isEqualTo("Student");
        }
    }

    // ================================================================== reviews

    @Nested
    class Reviews {

        @Test
        void bothSidesReviewOnceAfterCompletion() throws Exception {
            long orderId = completedOrder("Review flow item", 100_000);
            mvc.perform(get("/api/orders/" + orderId + "/reviews").header("Authorization", bearer(buyer)))
                    .andExpect(jsonPath("$.canReview").value(true));
            JsonNode mine = readJson(review(buyer, orderId, 5, "Great seller").andExpect(status().isCreated()));
            assertThat(mine.get("direction").asText()).isEqualTo("BUYER_TO_SELLER");
            assertThat(mine.get("reviewee").get("id").asInt()).isEqualTo(sellerId);
            review(seller, orderId, 4, "Paid quickly").andExpect(status().isCreated()).andExpect(jsonPath("$.direction").value("SELLER_TO_BUYER"));
            review(buyer, orderId, 1, "Changed my mind").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_REVIEWED"));
            JsonNode both = getJson("/api/orders/" + orderId + "/reviews", seller);
            assertThat(both.get("canReview").asBoolean()).isFalse();
            assertThat(both.get("mine").get("rating").asInt()).isEqualTo(4);
            assertThat(both.get("theirs").get("rating").asInt()).isEqualTo(5);
            JsonNode rating = getJson("/api/users/" + sellerId + "/ratings", null);
            assertThat(rating.get("count").asInt()).isEqualTo(jdbc.queryForObject("SELECT ReviewCount FROM dbo.vw_UserRatings WHERE UserId = ?", Integer.class, sellerId));
            assertThat(rating.get("average").decimalValue()).isEqualByComparingTo(
                    jdbc.queryForObject("SELECT AverageRating FROM dbo.vw_UserRatings WHERE UserId = ?", BigDecimal.class, sellerId));
            assertThat(rating.get("distribution").get("5").asInt()).isPositive();
            assertThat(getJson("/api/users/" + sellerId + "/reviews?role=SELLER", null).get("items").get(0).get("comment").asText()).isEqualTo("Great seller");
        }

        @Test
        void reviewsAreRefusedForUnfinishedOrdersStrangersAndBadRatings() throws Exception {
            long pending = checkout(buyer, approvedListing(sellerId, "Unfinished order", 30_000));
            review(buyer, pending, 5, "Too early").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REVIEW_NOT_ALLOWED"));
            long done = completedOrder("Review validation", 40_000);
            review(stranger, done, 5, "Not my order").andExpect(status().isNotFound());
            review(buyer, done, 6, null).andExpect(status().isBadRequest());
            review(buyer, done, 0, null).andExpect(status().isBadRequest());
            mvc.perform(post("/api/orders/" + done + "/reviews").header("Authorization", bearer(buyer)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"rating\":5,\"comment\":\"" + "x".repeat(501) + "\"}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/orders/" + done + "/reviews").contentType(MediaType.APPLICATION_JSON).content("{\"rating\":5}"))
                    .andExpect(status().isUnauthorized());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Reviews WHERE OrderId IN (?, ?)", Integer.class, pending, done)).isZero();
        }
    }

    // ================================================================== reports

    @Nested
    class Reports {

        @Test
        void studentsReportListingsAndAccountsAndAdminsDecideOnce() throws Exception {
            int listing = approvedListing(sellerId, "Reported listing", 30_000);
            JsonNode created = readJson(report(buyer, "LISTING", listing, "OFF_PLATFORM_PAYMENT", "Asked me to transfer money directly.")
                    .andExpect(status().isCreated()));
            assertThat(created.get("status").asText()).isEqualTo("OPEN");
            assertThat(created.get("reasonCode").asText()).isEqualTo("OFF_PLATFORM_PAYMENT");
            assertThat(created.has("reporter")).isFalse();
            long id = created.get("id").asLong();
            report(buyer, "LISTING", listing, "SPAM", null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REPORT_ALREADY_OPEN"));
            report(seller, "LISTING", listing, "SPAM", null).andExpect(status().isBadRequest());
            report(buyer, "USER", buyerId, "SPAM", null).andExpect(status().isBadRequest());
            report(buyer, "USER", 999_999, "SPAM", null).andExpect(status().isNotFound());
            report(buyer, "USER", sellerId, "BAD_CODE", null).andExpect(status().isBadRequest());
            report(buyer, "USER", sellerId, "HARASSMENT", "Rude messages").andExpect(status().isCreated());
            mvc.perform(post("/api/reports").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
            assertThat(getJson("/api/me/reports", buyer).findValues("id").stream().map(JsonNode::asLong).toList()).contains(id);
            assertThat(getJson("/api/me/reports", stranger).findValues("id").stream().map(JsonNode::asLong).toList()).doesNotContain(id);

            assertThat(allIds("/api/admin/reports", admin, "id")).contains(id);
            mvc.perform(get("/api/admin/reports").header("Authorization", bearer(buyer))).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/reports/" + id + "/review").header("Authorization", bearer(admin))).andExpect(jsonPath("$.status").value("REVIEWING"));
            List<ResponseEntity<String>> decisions = race(
                    () -> rest.exchange("/api/admin/reports/" + id + "/resolve", HttpMethod.POST,
                            new HttpEntity<>("{\"resolution\":\"Listing blocked and seller warned.\"}", headers(admin)), String.class),
                    () -> rest.exchange("/api/admin/reports/" + id + "/dismiss", HttpMethod.POST,
                            new HttpEntity<>("{\"resolution\":\"No violation was found here.\"}", headers(admin2)), String.class));
            assertThat(decisions.stream().filter(r -> r.getStatusCode() == HttpStatus.OK)).hasSize(1);
            assertThat(decisions.stream().filter(r -> r.getStatusCode() == HttpStatus.CONFLICT)).hasSize(1);
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Reports WHERE ReportId = ?", String.class, id)).isIn("Resolved", "Dismissed");
            // A report decision is only a record: the listing is unchanged until an admin acts on it explicitly.
            assertThat(moderationOf(listing)).isEqualTo("Approved");
        }
    }

    // ================================================================== disputes and settlements

    @Nested
    class DisputesAndSettlements {

        @Test
        void refundApprovedDecisionMovesNoMoneyAndHoldsThePayout() throws Exception {
            long orderId = deliveringOrder("Damaged on arrival", 200_000);
            long disputeId = openDispute(buyer, orderId, "The screen is cracked.");
            assertThat(getJson("/api/me/disputes", seller).findValues("id").stream().map(JsonNode::asLong).toList()).contains(disputeId);
            assertThat(getJson("/api/me/disputes", stranger).findValues("id").stream().map(JsonNode::asLong).toList()).doesNotContain(disputeId);
            mvc.perform(get("/api/admin/disputes").header("Authorization", bearer(seller))).andExpect(status().isForbidden());
            resolveDispute(disputeId, "MAYBE", "Some explanation here").andExpect(status().isBadRequest());
            resolveDispute(disputeId, "REFUND_APPROVED", "Photos confirm the damage.").andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("RESOLVED")).andExpect(jsonPath("$.decision").value("REFUND_APPROVED"))
                    .andExpect(jsonPath("$.refundReference").doesNotExist());
            resolveDispute(disputeId, "NO_REFUND", "Changing the decision later.").andExpect(status().isConflict());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Payments WHERE OrderId = ? AND Status = 'Succeeded'", Integer.class, orderId))
                    .as("no automatic refund").isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Orders WHERE OrderId = ?", String.class, orderId)).isEqualTo("Delivering");
            act(buyer, orderId, "confirm-receipt").andExpect(status().isOk());
            release(orderId, "BANK-TX-1").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SETTLEMENT_ON_HOLD"));
            mvc.perform(post("/api/admin/disputes/" + disputeId + "/confirm-refund").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"refundReference\":\"MOMO-REFUND-77\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.refundReference").value("MOMO-REFUND-77"));
            mvc.perform(post("/api/admin/disputes/" + disputeId + "/confirm-refund").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"refundReference\":\"MOMO-REFUND-78\"}")).andExpect(status().isConflict());
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.SellerSettlements WHERE OrderId = ?", String.class, orderId)).isEqualTo("Pending");
        }

        @Test
        void settlementAmountsAreExactAndReleasedOnceByAnAdmin() throws Exception {
            long orderId = completedOrder("Settled item", 200_000);
            JsonNode s = getJson("/api/admin/settlements/" + orderId, admin);
            assertThat(s.get("status").asText()).isEqualTo("PENDING");
            assertThat(s.get("merchandiseSubtotal").asLong()).isEqualTo(200_000);
            assertThat(s.get("commission").asLong()).isEqualTo(6_000);
            assertThat(s.get("shippingFee").asLong()).isEqualTo(FEE);
            assertThat(s.get("amount").asLong()).isEqualTo(200_000 - 6_000 + FEE);
            assertThat(s.get("sandbox").asBoolean()).isTrue();
            assertThat(allIds("/api/admin/settlements", admin, "orderId")).contains(orderId);
            mvc.perform(post("/api/admin/settlements/" + orderId + "/release").header("Authorization", bearer(seller)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"payoutReference\":\"SELF-PAY\"}")).andExpect(status().isForbidden());
            release(orderId, "").andExpect(status().isBadRequest());
            // A sandbox settlement needs an explicit acknowledgement that it is only a simulated record.
            mvc.perform(post("/api/admin/settlements/" + orderId + "/release").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"payoutReference\":\"BANK-TX-199\"}")).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("acknowledgeSimulated"));
            release(orderId, "BANK-TX-200").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RELEASED"))
                    .andExpect(jsonPath("$.payoutRecordType").value("SIMULATED_RECORD"))
                    .andExpect(jsonPath("$.payoutNote").value(org.hamcrest.Matchers.startsWith("[SANDBOX]")))
                    .andExpect(jsonPath("$.releasedBy.id").value(adminId)).andExpect(jsonPath("$.amount").value(200_000 - 6_000 + FEE));
            assertThat(jdbc.queryForObject("SELECT Reason FROM dbo.AdminActions WHERE EntityType = 'SellerSettlement' AND EntityId = ?", String.class, orderId))
                    .as("the audit row keeps the sandbox context").contains("[SANDBOX]").contains("BANK-TX-200");
            JsonNode d = getJson("/api/admin/dashboard", admin).get("settlements");
            assertThat(d.get("releasedRealAmountInPeriod").asLong()).as("no simulated payout counted as real money").isEqualTo(
                    jdbc.queryForObject("SELECT COALESCE(SUM(Amount), 0) FROM dbo.SellerSettlements WHERE Status = 'Released' AND IsSandbox = 0", Long.class));
            assertThat(d.get("releasedSandboxAmountInPeriod").asLong()).isGreaterThanOrEqualTo(200_000 - 6_000 + FEE);
            release(orderId, "BANK-TX-201").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SETTLEMENT_STATE_CONFLICT"));
            assertThat(jdbc.queryForObject("SELECT PayoutReference FROM dbo.SellerSettlements WHERE OrderId = ?", String.class, orderId)).isEqualTo("BANK-TX-200");
        }

        @Test
        void historicalV001SettlementsAreShownAsStored() throws Exception {
            JsonNode historical = getJson("/api/admin/settlements/4", admin);
            Map<String, Object> row = jdbc.queryForMap("SELECT Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee FROM dbo.SellerSettlements WHERE OrderId = 4");
            assertThat(historical.get("amount").asLong()).isEqualTo(((BigDecimal) row.get("Amount")).longValue());
            assertThat(historical.get("shippingFee").asLong()).isEqualTo(((BigDecimal) row.get("ShippingFee")).longValue());
            assertThat(historical.get("commission").asLong()).isEqualTo(((BigDecimal) row.get("CommissionAmount")).longValue());
            // V001 paid out merchandise only (no delivery fee); V002 kept the amount. It is labelled, never "corrected".
            long orderPayout = jdbc.queryForObject("SELECT SellerPayoutTotal FROM dbo.Orders WHERE OrderId = 4", Long.class);
            long orderFee = jdbc.queryForObject("SELECT ShippingFee FROM dbo.Orders WHERE OrderId = 4", Long.class);
            assertThat(historical.get("calculation").asText()).isEqualTo(orderFee > 0 ? "LEGACY_V001_MERCHANDISE_ONLY" : "STANDARD");
            assertThat(historical.get("orderSellerPayout").asLong()).isEqualTo(orderPayout);
            assertThat(orderPayout - historical.get("amount").asLong()).isEqualTo(orderFee - historical.get("shippingFee").asLong());
        }

        @Test
        void everySettlementIsLabelledLegacyOnlyWhenItLacksTheOrderDeliveryFee() throws Exception {
            long orderId = completedOrder("Standard settlement", 120_000);
            JsonNode current = getJson("/api/admin/settlements/" + orderId, admin);
            assertThat(current.get("calculation").asText()).isEqualTo("STANDARD");
            assertThat(current.get("amount").asLong()).isEqualTo(current.get("orderSellerPayout").asLong());
            JsonNode sellerView = getJson("/api/orders/" + orderId, seller).get("settlement");
            assertThat(sellerView.get("calculation").asText()).isEqualTo("STANDARD");
            assertThat(sellerView.get("amount").asLong()).isEqualTo(getJson("/api/orders/" + orderId, seller).get("amounts").get("sellerPayout").asLong());
            assertThat(getJson("/api/orders/" + orderId, buyer).get("settlement")).as("buyers never see the payout").isNull();
            int legacyRows = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId
                    WHERE s.ShippingFee <> o.ShippingFee AND s.OrderId > 4""", Integer.class);
            assertThat(legacyRows).as("only the four V001 demo settlements can differ from their order").isZero();
        }
    }

    // ================================================================== promotions

    @Nested
    class Promotions {

        @Test
        void packagesComeFromTheDatabase() throws Exception {
            JsonNode packages = readJson(mvc.perform(get("/api/promotion-packages")).andExpect(status().isOk()));
            assertThat(packages).hasSize(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.PromotionPackages", Integer.class));
            assertThat(packages.findValues("price").stream().map(JsonNode::asLong).toList()).containsExactly(5_000L, 15_000L, 30_000L);
        }

        @Test
        void aVerifiedPaymentFeaturesTheListingForThePackageDuration() throws Exception {
            int listing = approvedListing(sellerId, "Promoted chair", 80_000);
            int pkg = packageId(72);
            JsonNode started = readJson(promote(seller, listing, pkg, "MOMO").andExpect(status().isCreated()));
            assertThat(started.get("status").asText()).isEqualTo("PENDING");
            assertThat(started.get("amount").asLong()).isEqualTo(15_000);
            assertThat(started.get("sandbox").asBoolean()).isTrue();
            assertThat(started.toString()).doesNotContain("UMP-");
            mvc.perform(get("/api/products/" + listing)).andExpect(jsonPath("$.featured").value(false));
            promote(seller, listing, pkg, "MOMO").andExpect(status().isOk()).andExpect(jsonPath("$.resumed").value(true))
                    .andExpect(jsonPath("$.id").value(started.get("id").asLong()));
            JsonNode paid = readJson(completePromotion(seller, started.get("id").asLong(), true).andExpect(status().isOk()));
            assertThat(getJson("/api/me/products/" + listing + "/promotions", seller).get(0).get("id").asLong()).isEqualTo(started.get("id").asLong());
            assertThat(paid.get("status").asText()).isEqualTo("PAID");
            assertThat(paid.get("active").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT DATEDIFF(hour, StartsAt, EndsAt) FROM dbo.ProductPromotions WHERE PromotionId = ?", Integer.class,
                    started.get("id").asLong())).isEqualTo(72);
            mvc.perform(get("/api/products/" + listing)).andExpect(jsonPath("$.featured").value(true));
            promote(seller, listing, packageId(24), "MOMO").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMOTION_NOT_ALLOWED"));
            // When the window has passed the listing is no longer featured and can be promoted again.
            jdbc.update("UPDATE dbo.ProductPromotions SET StartsAt = DATEADD(day, -10, StartsAt), EndsAt = DATEADD(day, -10, EndsAt) WHERE PromotionId = ?",
                    started.get("id").asLong());
            mvc.perform(get("/api/products/" + listing)).andExpect(jsonPath("$.featured").value(false));
            promote(seller, listing, packageId(24), "ZALOPAY").andExpect(status().isCreated());
        }

        @Test
        void recommendedOrderPutsRunningPromotionsFirstBeforePagination() throws Exception {
            String token = "RecLamp" + System.nanoTime(); // unique per run: test copies keep rows of earlier runs
            int listing = approvedListing(sellerId, token + " desk lamp", 70_000);
            // Old listing: without a promotion it would be on the last page of both orders.
            jdbc.update("UPDATE dbo.Products SET CreatedAt = DATEADD(day, -900, CreatedAt) WHERE ProductId = ?", listing);
            assertThat(catalogIds(getJson("/api/products?size=5", null))).doesNotContain(listing);

            // A failed payment changes nothing.
            JsonNode failed = readJson(promote(seller, listing, packageId(24), "MOMO").andExpect(status().isCreated()));
            completePromotion(seller, failed.get("id").asLong(), false).andExpect(status().isOk());
            assertThat(catalogIds(getJson("/api/products?size=5", null))).doesNotContain(listing);

            JsonNode started = readJson(promote(seller, listing, packageId(24), "ZALOPAY").andExpect(status().isCreated()));
            completePromotion(seller, started.get("id").asLong(), true).andExpect(status().isOk());
            int running = jdbc.queryForObject("SELECT COUNT(DISTINCT c.ProductId) FROM dbo.vw_ProductCatalog c WHERE c.IsFeatured = 1", Integer.class);
            JsonNode all = getJson("/api/products?size=50", null);
            List<Integer> order = catalogIds(all);
            assertThat(order).contains(listing);
            // Every featured listing comes before every ordinary one, and newest first inside each group.
            for (int i = 0; i < order.size(); i++) {
                assertThat(all.get("items").get(i).get("featured").asBoolean()).as("position %d", i).isEqualTo(i < running);
            }
            List<String> featuredDates = new ArrayList<>();
            all.get("items").forEach(item -> { if (item.get("featured").asBoolean()) featuredDates.add(item.get("createdAt").asText()); });
            assertThat(featuredDates).isSortedAccordingTo((a, b) -> b.compareTo(a));

            // Applied before pagination: the pages of the recommended order are disjoint and cover the same total.
            JsonNode first = getJson("/api/products?size=5&page=1", null);
            JsonNode second = getJson("/api/products?size=5&page=2", null);
            assertThat(first.get("totalItems").asInt()).isEqualTo(getJson("/api/products?size=5&sort=newest", null).get("totalItems").asInt());
            assertThat(catalogIds(first)).doesNotContainAnyElementsOf(catalogIds(second));
            if (running <= 5) assertThat(catalogIds(first)).contains(listing);
            // Explicit sorts are kept, filters still apply.
            assertThat(catalogIds(getJson("/api/products?size=5&sort=newest", null))).doesNotContain(listing);
            assertThat(catalogIds(getJson("/api/products?size=50&maxPrice=60000", null))).doesNotContain(listing);
            assertThat(catalogIds(getJson("/api/products?size=50&q=" + token, null))).containsExactly(listing);

            // A listing that is no longer available is never shown, even while its promotion runs.
            jdbc.update("UPDATE dbo.Products SET Status = 'Reserved' WHERE ProductId = ?", listing);
            assertThat(catalogIds(getJson("/api/products?size=50", null))).doesNotContain(listing);
            assertThat(catalogIds(getJson("/api/products?size=50&featured=true", null))).doesNotContain(listing);
            jdbc.update("UPDATE dbo.Products SET Status = 'Available' WHERE ProductId = ?", listing);

            // When the window has passed the listing loses its priority again.
            jdbc.update("UPDATE dbo.ProductPromotions SET StartsAt = DATEADD(day, -10, StartsAt), EndsAt = DATEADD(day, -10, EndsAt) WHERE PromotionId = ?",
                    started.get("id").asLong());
            assertThat(catalogIds(getJson("/api/products?size=5", null))).doesNotContain(listing);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.ProductPromotions WHERE ProductId = ? AND Status = 'Paid'", Integer.class, listing)).isEqualTo(1);
        }

        @Test
        void onlyTheSellerOfAnEligibleListingCanBuyAndFailuresAreNotFeatured() throws Exception {
            int listing = approvedListing(sellerId, "Promotion rules", 80_000);
            promote(stranger, listing, packageId(24), "MOMO").andExpect(status().isNotFound());
            promote(seller, listing, 999, "MOMO").andExpect(status().isBadRequest());
            promote(seller, listing, packageId(24), "CARD").andExpect(status().isBadRequest());
            int pending = pendingListing("Unapproved promotion", 30_000);
            promote(seller, pending, packageId(24), "MOMO").andExpect(status().isConflict());
            JsonNode attempt = readJson(promote(seller, listing, packageId(24), "MOMO").andExpect(status().isCreated()));
            completePromotion(stranger, attempt.get("id").asLong(), true).andExpect(status().isNotFound());
            completePromotion(seller, attempt.get("id").asLong(), false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("FAILED"));
            mvc.perform(get("/api/products/" + listing)).andExpect(jsonPath("$.featured").value(false));
            promote(seller, listing, packageId(24), "MOMO").andExpect(status().isCreated());
        }

        @Test
        void concurrentPurchasesAndReplayedNotificationsCannotDoubleActivate() throws Exception {
            int listing = approvedListing(sellerId, "Concurrent promotion", 80_000);
            int pkg = packageId(24);
            String body = "{\"packageId\":" + pkg + ",\"provider\":\"MOMO\"}";
            List<ResponseEntity<String>> starts = race(
                    () -> rest.exchange("/api/products/" + listing + "/promotions", HttpMethod.POST, new HttpEntity<>(body, headers(seller)), String.class),
                    () -> rest.exchange("/api/products/" + listing + "/promotions", HttpMethod.POST, new HttpEntity<>(body, headers(seller)), String.class));
            assertThat(starts.stream().filter(r -> r.getStatusCode() == HttpStatus.CREATED)).hasSize(1);
            assertThat(starts.stream().filter(r -> r.getStatusCode() == HttpStatus.OK)).as("the other one resumes it").hasSize(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.ProductPromotions WHERE ProductId = ?", Integer.class, listing)).isEqualTo(1);
            long id = jdbc.queryForObject("SELECT PromotionId FROM dbo.ProductPromotions WHERE ProductId = ?", Long.class, listing);
            String key = jdbc.queryForObject("SELECT RequestKey FROM dbo.ProductPromotions WHERE PromotionId = ?", String.class, id);
            PaymentResultService.PaymentNotification paid = new PaymentResultService.PaymentNotification(key, "SIM-c-" + UUID.randomUUID(), 5_000, true, "MOMO");
            String signature = simulator.sign(paid);
            List<ResponseEntity<String>> callbacks = race(() -> callback(paid, signature), () -> callback(paid, signature));
            assertThat(callbacks).allMatch(r -> r.getStatusCode() == HttpStatus.OK);
            assertThat(callbacks.stream().filter(r -> r.getBody().contains("\"RECORDED\""))).hasSize(1);
            assertThat(callbacks.stream().filter(r -> r.getBody().contains("DUPLICATE_IGNORED"))).hasSize(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.ProductPromotions WHERE ProductId = ? AND Status = 'Paid'", Integer.class, listing)).isEqualTo(1);
            List<ResponseEntity<String>> again = race(
                    () -> rest.exchange("/api/products/" + listing + "/promotions", HttpMethod.POST, new HttpEntity<>(body, headers(seller)), String.class),
                    () -> rest.exchange("/api/products/" + listing + "/promotions", HttpMethod.POST, new HttpEntity<>(body, headers(seller)), String.class));
            assertThat(again).as("no second promotion while one is active").allMatch(r -> r.getStatusCode() == HttpStatus.CONFLICT);
        }

        @Test
        void promotionNotificationsMustBeSignedAndMatchTheStoredAmount() throws Exception {
            int listing = approvedListing(sellerId, "Signed promotion", 80_000);
            long id = readJson(promote(seller, listing, packageId(168), "MOMO").andExpect(status().isCreated())).get("id").asLong();
            String key = jdbc.queryForObject("SELECT RequestKey FROM dbo.ProductPromotions WHERE PromotionId = ?", String.class, id);
            PaymentResultService.PaymentNotification cheap = new PaymentResultService.PaymentNotification(key, "SIM-p-" + UUID.randomUUID(), 1_000, true, "MOMO");
            assertThat(callback(cheap, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(callback(cheap, simulator.sign(cheap)).getBody()).contains("PAYMENT_MISMATCH");
            PaymentResultService.PaymentNotification good = new PaymentResultService.PaymentNotification(key, "SIM-p-" + UUID.randomUUID(), 30_000, true, "MOMO");
            assertThat(callback(good, simulator.sign(good)).getBody()).contains("RECORDED").contains("PAID");
            assertThat(callback(good, simulator.sign(good)).getBody()).contains("DUPLICATE_IGNORED");
            PaymentResultService.PaymentNotification other = new PaymentResultService.PaymentNotification(key, "SIM-q-" + UUID.randomUUID(), 30_000, false, "MOMO");
            assertThat(callback(other, simulator.sign(other)).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.ProductPromotions WHERE PromotionId = ?", String.class, id)).isEqualTo("Paid");
        }
    }

    // ================================================================== dashboard

    @Nested
    class Dashboard {

        @Test
        void figuresMatchTheDatabaseWithoutDoubleCounting() throws Exception {
            // An order with two items: GMV must count its subtotal once.
            int a = approvedListing(sellerId, "Dashboard item A", 10_000);
            int b = approvedListing(sellerId, "Dashboard item B", 20_000);
            long twoItems = completedOrder(List.of(a, b));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderItems WHERE OrderId = ?", Integer.class, twoItems)).isEqualTo(2);
            JsonNode d = getJson("/api/admin/dashboard", admin);
            Map<String, Object> expected = jdbc.queryForMap("SELECT COUNT(*) n, SUM(Subtotal) gmv, SUM(ShippingFee) ship, SUM(TotalAmount) total, "
                    + "SUM(CommissionAmount) commission FROM dbo.Orders WHERE Status = 'Completed'");
            assertThat(d.get("finance").get("completedOrders").asLong()).isEqualTo(((Number) expected.get("n")).longValue());
            assertThat(d.get("finance").get("grossMerchandiseValue").asLong()).isEqualTo(((BigDecimal) expected.get("gmv")).longValue());
            assertThat(d.get("finance").get("shippingFees").asLong()).isEqualTo(((BigDecimal) expected.get("ship")).longValue());
            assertThat(d.get("finance").get("buyerPaidTotal").asLong()).isEqualTo(((BigDecimal) expected.get("total")).longValue());
            assertThat(d.get("finance").get("commissionRevenue").asLong()).isEqualTo(((BigDecimal) expected.get("commission")).longValue());
            assertThat(d.get("finance").get("buyerPaidTotal").asLong()).as("buyer total = GMV + shipping, never revenue")
                    .isEqualTo(d.get("finance").get("grossMerchandiseValue").asLong() + d.get("finance").get("shippingFees").asLong());
            assertThat(d.get("listings").get("pendingModeration").asLong())
                    .isEqualTo(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Products WHERE ModerationStatus = 'Pending'", Long.class));
            assertThat(d.get("settlements").get("pendingAmount").asLong())
                    .isEqualTo(jdbc.queryForObject("SELECT COALESCE(SUM(Amount), 0) FROM dbo.SellerSettlements WHERE Status = 'Pending'", Long.class));
            assertThat(d.get("promotions").get("activePaid").asLong()).isEqualTo(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM dbo.ProductPromotions WHERE Status = 'Paid' AND StartsAt <= SYSUTCDATETIME() AND EndsAt > SYSUTCDATETIME()", Long.class));
            JsonNode badges = getJson("/api/admin/badges", admin);
            assertThat(badges.get("openDisputes").asLong()).isEqualTo(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderDisputes WHERE Status = 'Open'", Long.class));
        }

        @Test
        void anEmptyPeriodReturnsZerosAndBadRangesAreRejected() throws Exception {
            JsonNode empty = getJson("/api/admin/dashboard?from=2001-01-01&to=2001-01-31", admin);
            assertThat(empty.get("finance").get("completedOrders").asLong()).isZero();
            assertThat(empty.get("finance").get("commissionRevenue").asLong()).isZero();
            assertThat(empty.get("promotions").get("paidRevenueInPeriod").asLong()).isZero();
            assertThat(empty.get("period").get("from").asText()).startsWith("2001-01-01T00:00");
            mvc.perform(get("/api/admin/dashboard?from=2026-02-01&to=2026-01-01").header("Authorization", bearer(admin))).andExpect(status().isBadRequest());
            mvc.perform(get("/api/admin/dashboard").header("Authorization", bearer(buyer))).andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/orders").header("Authorization", bearer(admin))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].role").value("ADMIN"));
            mvc.perform(get("/api/admin/orders").header("Authorization", bearer(buyer))).andExpect(status().isForbidden());
        }
    }

    // ================================================================== contact settings

    @Nested
    class ContactSettings {

        @Test
        void usersManageTheirOwnContactAndSharingIsRespected() throws Exception {
            int userId = newUser("Student", "Contact owner");
            String token = token(userId);
            int listing = approvedListing(userId, "Contact listing", 30_000);
            putContact(token, "{\"phone\":\"12345\",\"zaloUrl\":null,\"showContact\":false}").andExpect(status().isBadRequest());
            putContact(token, "{\"phone\":null,\"zaloUrl\":\"https://evil.example/x\",\"showContact\":false}").andExpect(status().isBadRequest());
            putContact(token, "{\"phone\":null,\"zaloUrl\":null,\"showContact\":true}").andExpect(status().isBadRequest());
            putContact(token, "{\"phone\":\"0912 345 678\",\"zaloUrl\":\"https://zalo.me/0912345678\",\"showContact\":true}")
                    .andExpect(status().isOk()).andExpect(jsonPath("$.phone").value("0912345678"));
            mvc.perform(get("/api/products/" + listing)).andExpect(jsonPath("$.seller.contact.phone").value("0912345678"));
            mvc.perform(get("/api/users/" + userId)).andExpect(jsonPath("$.contact.zaloUrl").value("https://zalo.me/0912345678"));
            putContact(token, "{\"phone\":\"0912345678\",\"zaloUrl\":null,\"showContact\":false}").andExpect(status().isOk());
            mvc.perform(get("/api/products/" + listing)).andExpect(jsonPath("$.seller.contact").doesNotExist());
            mvc.perform(get("/api/users/" + userId)).andExpect(jsonPath("$.contact").doesNotExist())
                    .andExpect(jsonPath("$.emailVerified").value(true)).andExpect(jsonPath("$.verifiedStudent").doesNotExist());
            mvc.perform(put("/api/me/contact").contentType(MediaType.APPLICATION_JSON).content("{\"showContact\":false}")).andExpect(status().isUnauthorized());
        }
    }

    // ================================================================== helpers

    private int newUser(String role, String name) {
        String email = "it-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20) + "@fpt.edu.vn";
        jdbc.update("INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, Role, Status, EmailVerifiedAt) "
                + "VALUES (?, ?, ?, 1, ?, 'Active', SYSUTCDATETIME())", email, passwordEncoder.encode("Secret123"), name, role);
        return jdbc.queryForObject("SELECT UserId FROM dbo.Users WHERE Email = ?", Integer.class, email);
    }

    private String token(int userId) throws Exception {
        String email = jdbc.queryForObject("SELECT Email FROM dbo.Users WHERE UserId = ?", String.class, userId);
        return readJson(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", "Secret123")))).andExpect(status().isOk())).get("accessToken").asText();
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private static String listingJson(String title, long price) {
        return "{\"title\":\"" + title + "\",\"description\":\"A clean, well kept item from a student.\",\"price\":" + price
                + ",\"originalPrice\":null,\"condition\":\"USED\",\"categoryId\":1,\"campusId\":null,\"pickupLatitude\":21.013100,\"pickupLongitude\":105.525100}";
    }

    /** A pending listing of the test seller (created directly, as Stage 3 would leave it). */
    private int pendingListing(String title, long price) {
        return jdbc.queryForObject("INSERT dbo.Products (SellerId, CategoryId, CampusId, Title, Description, Condition, Price, Status, ModerationStatus) "
                + "OUTPUT inserted.ProductId VALUES (?, 1, 1, ?, N'A clean, well kept item from a student.', 'Used', ?, 'Available', 'Pending')",
                Integer.class, sellerId, title, price);
    }

    private int approvedListing(int owner, String title, long price) {
        return jdbc.queryForObject("INSERT dbo.Products (SellerId, CategoryId, CampusId, Title, Description, Condition, Price, Status, ModerationStatus) "
                + "OUTPUT inserted.ProductId VALUES (?, 1, 1, ?, N'A clean, well kept item from a student.', 'Used', ?, 'Available', 'Approved')",
                Integer.class, owner, title, price);
    }

    /** Pending listing approved through the admin API. */
    private int approvedListingViaApi(String title, long price) throws Exception {
        int id = pendingListing(title, price);
        approve(admin, id, version(id)).andExpect(status().isOk());
        return id;
    }

    private String version(int productId) throws Exception {
        return getJson("/api/admin/listings/" + productId, admin).get("version").asText();
    }

    private String moderationOf(int productId) {
        return jdbc.queryForObject("SELECT ModerationStatus FROM dbo.Products WHERE ProductId = ?", String.class, productId);
    }

    private ResultActions approve(String token, int productId, String version) throws Exception {
        return mvc.perform(post("/api/admin/listings/" + productId + "/approve").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"" + version + "\"}"));
    }

    /** V003 checkout: gets a simulated quote as this buyer, picks STANDARD_SIM per seller, then checks out. */
    private long checkout(String token, int... productIds) throws Exception {
        List<Integer> ids = java.util.Arrays.stream(productIds).boxed().toList();
        JsonNode quote = readJson(mvc.perform(post("/api/shipping/quotes").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("productIds", ids, "deliveryZoneId", deliveryZone)))).andExpect(status().isOk()));
        List<Map<String, Object>> shipping = new java.util.ArrayList<>();
        for (JsonNode group : quote.get("groups")) {
            for (JsonNode option : group.get("options")) {
                if ("STANDARD_SIM".equals(option.get("carrier").asText())) {
                    FEE = option.get("fee").asLong();
                    shipping.add(Map.of("sellerId", group.get("sellerId").asInt(), "carrier", "STANDARD_SIM",
                            "quoteToken", option.get("quoteToken").asText()));
                }
            }
        }
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("productIds", ids);
        body.put("recipientName", "Stage5 Buyer");
        body.put("recipientPhone", "0912345678");
        body.put("deliveryAddress", "Dormitory B, room 101");
        body.put("paymentProvider", "MOMO");
        body.put("deliveryZoneId", deliveryZone);
        body.put("shipping", shipping);
        body.put("deliveryLatitude", new java.math.BigDecimal("21.036200"));
        body.put("deliveryLongitude", new java.math.BigDecimal("105.790500"));
        return readJson(mvc.perform(post("/api/checkout").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body))).andExpect(status().isCreated()))
                .get("orders").get(0).get("id").asLong();
    }

    private ResultActions act(String token, long orderId, String action) throws Exception {
        return mvc.perform(post("/api/orders/" + orderId + "/" + action).header("Authorization", bearer(token)));
    }

    private long deliveringOrder(String title, long price) throws Exception {
        long id = checkout(buyer, approvedListing(sellerId, title, price));
        act(seller, id, "confirm").andExpect(status().isOk());
        long paymentId = readJson(act(buyer, id, "payments")).get("paymentId").asLong();
        mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").header("Authorization", bearer(buyer))
                .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isOk());
        act(seller, id, "ship").andExpect(status().isOk());
        return id;
    }

    private long completedOrder(String title, long price) throws Exception {
        long id = deliveringOrder(title, price);
        act(buyer, id, "confirm-receipt").andExpect(status().isOk());
        return id;
    }

    private long completedOrder(List<Integer> productIds) throws Exception {
        long id = checkout(buyer, productIds.stream().mapToInt(Integer::intValue).toArray());
        act(seller, id, "confirm").andExpect(status().isOk());
        long paymentId = readJson(act(buyer, id, "payments")).get("paymentId").asLong();
        mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").header("Authorization", bearer(buyer))
                .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isOk());
        act(seller, id, "ship").andExpect(status().isOk());
        act(buyer, id, "confirm-receipt").andExpect(status().isOk());
        return id;
    }

    private long openDispute(String token, long orderId, String reason) throws Exception {
        return readJson(mvc.perform(post("/api/orders/" + orderId + "/disputes").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + reason + "\"}")).andExpect(status().isCreated()))
                .get("disputes").get(0).get("id").asLong();
    }

    private ResultActions resolveDispute(long disputeId, String decision, String resolution) throws Exception {
        return mvc.perform(post("/api/admin/disputes/" + disputeId + "/resolve").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"" + decision + "\",\"resolution\":\"" + resolution + "\"}"));
    }

    /** Releases a (sandbox) settlement, acknowledging that it is only a simulated record. */
    private ResultActions release(long orderId, String reference) throws Exception {
        return mvc.perform(post("/api/admin/settlements/" + orderId + "/release").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"payoutReference\":\"" + reference + "\",\"acknowledgeSimulated\":true}"));
    }

    private ResultActions review(String token, long orderId, int rating, String comment) throws Exception {
        return mvc.perform(post("/api/orders/" + orderId + "/reviews").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(comment == null ? Map.of("rating", rating) : Map.of("rating", rating, "comment", comment))));
    }

    private ResultActions report(String token, String type, int targetId, String reason, String details) throws Exception {
        Map<String, Object> body = new HashMap<>(Map.of("targetType", type, "targetId", targetId, "reason", reason));
        if (details != null) {
            body.put("details", details);
        }
        return mvc.perform(post("/api/reports").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private int packageId(int hours) {
        return jdbc.queryForObject("SELECT PackageId FROM dbo.PromotionPackages WHERE DurationHours = ?", Integer.class, hours);
    }

    private ResultActions promote(String token, int listing, int packageId, String provider) throws Exception {
        return mvc.perform(post("/api/products/" + listing + "/promotions").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"packageId\":" + packageId + ",\"provider\":\"" + provider + "\"}"));
    }

    private ResultActions completePromotion(String token, long promotionId, boolean success) throws Exception {
        return mvc.perform(post("/api/dev/payment-simulator/promotions/" + promotionId + "/complete").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"" + (success ? "SUCCESS" : "FAILURE") + "\"}"));
    }

    private ResultActions putContact(String token, String body) throws Exception {
        return mvc.perform(put("/api/me/contact").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResponseEntity<String> callback(PaymentResultService.PaymentNotification notification, String signature) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (signature != null) {
            headers.set("X-Simulator-Signature", signature);
        }
        return rest.exchange("/api/dev/payment-simulator/callback", HttpMethod.POST, new HttpEntity<>(json.writeValueAsString(notification), headers), String.class);
    }

    private HttpHeaders headers(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return headers;
    }

    private JsonNode getJson(String url, String token) throws Exception {
        MockHttpServletRequestBuilder request = get(url);
        if (token != null) {
            request.header("Authorization", bearer(token));
        }
        return readJson(mvc.perform(request).andExpect(status().isOk()));
    }

    /** @return listing ids of a catalog page, in response order */
    private static List<Integer> catalogIds(JsonNode page) {
        List<Integer> ids = new ArrayList<>();
        page.get("items").forEach(item -> ids.add(item.get("id").asInt()));
        return ids;
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    /**
     * Ids from every page of an admin list. The shared *Test database keeps data from earlier runs, so a queue can be
     * longer than one page (an item created now may be on page 2).
     */
    private List<Long> allIds(String url, String token, String field) throws Exception {
        List<Long> all = new ArrayList<>();
        String separator = url.contains("?") ? "&" : "?";
        for (int page = 1; ; page++) {
            JsonNode body = getJson(url + separator + "size=100&page=" + page, token);
            all.addAll(ids(body, field));
            if (page >= body.path("totalPages").asInt(1)) {
                return all;
            }
        }
    }

    private static List<Long> ids(JsonNode page) {
        return ids(page, "id");
    }

    private static List<Long> ids(JsonNode page, String field) {
        List<Long> ids = new ArrayList<>();
        (page.has("items") ? page.get("items") : page).forEach(o -> ids.add(o.get(field).asLong()));
        return ids;
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
            for (Future<ResponseEntity<String>> f : futures) {
                results.add(f.get());
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    /** Demo rows: users 1-17, listings 1-50, orders 1-12 with payments and settlements, reports 1-6, reviews 1-8, admin actions 1-2, promotions 1-6. */
    private String demoChecksum() {
        return new HashMap<>(jdbc.queryForMap("SELECT "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(UserId, Email, PasswordHash, FullName, Role, Status, Phone, ZaloUrl, ShowContact, UpdatedAt)) FROM dbo.Users WHERE UserId <= 17) AS users, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ProductId, Title, Price, Status, ModerationStatus, UpdatedAt)) FROM dbo.Products WHERE ProductId <= 50) AS products, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(OrderId, Status, Subtotal, ShippingFee, PaidAt, CompletedAt, CancelledAt)) FROM dbo.Orders WHERE OrderId <= 12) AS orders, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(PaymentId, Status, Amount, ProviderReference)) FROM dbo.Payments WHERE OrderId <= 12) AS payments, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(OrderId, Status, Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee, PayoutReference, ReleasedBy)) FROM dbo.SellerSettlements WHERE OrderId <= 12) AS settlements, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ReportId, Status, Resolution, ResolvedBy)) FROM dbo.Reports WHERE ReportId <= 6) AS reports, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ReviewId, Rating, Comment, IsHidden)) FROM dbo.Reviews WHERE ReviewId <= 8) AS reviews, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ActionId, AdminId, Action, EntityId, Reason)) FROM dbo.AdminActions WHERE ActionId <= 2) AS adminActions, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(PromotionId, Status, Amount, StartsAt, EndsAt, ProviderReference)) FROM dbo.ProductPromotions WHERE PromotionId <= 6) AS promotions, "
                + "(SELECT COUNT(*) FROM dbo.OrderDisputes WHERE OrderId <= 12) AS disputes")).toString();
    }
}
