package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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
import org.springframework.core.io.ByteArrayResource;
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
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Stage 3 end-to-end tests: catalog, product page, reference data, listings, photos and favorites,
 * against a real SQL Server database.
 *
 * <p>They INSERT and UPDATE rows, so they run only with {@code UNIMARKET_WRITE_IT=true} and refuse to start
 * unless the database name contains "Test". Test users and listings are created by the tests; the demo
 * users (1–17), demo listings (1–50) and their photos are only read and are compared before and after.
 * Uploaded photos go to a temporary directory.</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_WRITE_IT", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProductIntegrationTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0};
    private static final byte[] WEBP = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '};
    private static Path uploadDir;

    @Autowired private MockMvc mvc;
    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private EntityManagerFactory entityManagerFactory;

    private String demoChecksum;
    private String seller;        // token of test seller A
    private String otherStudent;  // token of test student B
    private String admin;         // token of a test admin
    private Integer sellerId;

    @DynamicPropertySource
    static void uploads(DynamicPropertyRegistry registry) throws IOException {
        uploadDir = Files.createTempDirectory("unimarket-test-uploads");
        registry.add("unimarket.storage.upload-dir", uploadDir::toString);
    }

    @BeforeAll
    void setUp() throws Exception {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
        demoChecksum = demoChecksum();
        sellerId = newUser("Student", "Seller A");
        seller = token(emailOf(sellerId));
        otherStudent = token(emailOf(newUser("Student", "Student B")));
        admin = token(emailOf(newUser("Admin", "Test Admin")));
    }

    @AfterAll
    void demoDataUnchanged() {
        assertThat(demoChecksum()).as("demo users, listings and photos must not change").isEqualTo(demoChecksum);
    }

    // ================================================================== catalog (public)

    @Nested
    class Catalog {

        @Test
        void visitorsSeeOnlyPublicAvailableListings() throws Exception {
            int expected = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ProductCatalog", Integer.class);
            JsonNode page = getJson("/api/products?size=50", null);
            assertThat(page.get("totalItems").asInt()).isEqualTo(expected);
            List<Integer> hidden = jdbc.queryForList("SELECT ProductId FROM dbo.Products WHERE Status <> 'Available' OR ModerationStatus <> 'Approved'", Integer.class);
            for (JsonNode item : allItems("")) {
                assertThat(item.get("status").asText()).isEqualTo("AVAILABLE");
                assertThat(item.get("purchasable").asBoolean()).isTrue();
                assertThat(hidden).doesNotContain(item.get("id").asInt());
                assertThat(item.has("moderation")).isFalse();
                assertThat(item.get("seller").has("email")).isFalse();
            }
        }

        @Test
        void paginationIsOneBasedAndStable() throws Exception {
            JsonNode first = getJson("/api/products?size=5&page=1", null);
            JsonNode second = getJson("/api/products?size=5&page=2", null);
            int total = first.get("totalItems").asInt();
            assertThat(first.get("items")).hasSize(5);
            assertThat(first.get("totalPages").asInt()).isEqualTo((total + 4) / 5);
            assertThat(second.get("page").asInt()).isEqualTo(2);
            assertThat(ids(first)).doesNotContainAnyElementsOf(ids(second));
            assertThat(getJson("/api/products?size=5&page=999", null).get("items")).isEmpty();
        }

        @Test
        void sortingByPriceAndNewest() throws Exception {
            List<Long> asc = prices(getJson("/api/products?size=50&sort=price_asc", null));
            assertThat(asc).isSortedAccordingTo(Long::compare);
            List<Long> desc = prices(getJson("/api/products?size=50&sort=price_desc", null));
            assertThat(desc).isSortedAccordingTo((a, b) -> Long.compare(b, a));
            List<String> created = new ArrayList<>();
            getJson("/api/products?size=50&sort=newest", null).get("items").forEach(i -> created.add(i.get("createdAt").asText()));
            assertThat(created).isSortedAccordingTo((a, b) -> b.compareTo(a));
        }

        @Test
        void keywordSearchUsesTheTitleAndEscapesWildcards() throws Exception {
            JsonNode page = search("logitech");
            assertThat(page.get("totalItems").asInt()).isEqualTo(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM dbo.vw_ProductCatalog WHERE Title LIKE N'%Logitech%'", Integer.class)).isPositive();
            page.get("items").forEach(i -> assertThat(i.get("title").asText().toLowerCase()).contains("logitech"));
            // Vietnamese titles (nvarchar) are matched too.
            assertThat(search("Màn hình").get("totalItems").asInt()).isEqualTo(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM dbo.vw_ProductCatalog WHERE Title LIKE N'%Màn hình%'", Integer.class)).isPositive();
            // '%' and '_' are literal characters, not wildcards (no demo title contains them).
            assertThat(search("%").get("totalItems").asInt()).isZero();
            assertThat(search("_").get("totalItems").asInt()).isZero();
            assertThat(search("Logitech%").get("totalItems").asInt()).isZero();
        }

        @Test
        void filtersByCategoryConditionCampusAndPrice() throws Exception {
            getJson("/api/products?size=50&categoryId=1", null).get("items")
                    .forEach(i -> assertThat(i.get("category").get("id").asInt()).isEqualTo(1));
            getJson("/api/products?size=50&condition=NEW,USED", null).get("items")
                    .forEach(i -> assertThat(i.get("condition").asText()).isIn("NEW", "USED"));
            getJson("/api/products?size=50&campusId=1&universityId=1", null).get("items")
                    .forEach(i -> assertThat(i.get("campus").get("id").asInt()).isEqualTo(1));
            int demoSeller = jdbc.queryForObject("SELECT TOP 1 SellerId FROM dbo.vw_ProductCatalog GROUP BY SellerId ORDER BY COUNT(*) DESC", Integer.class);
            JsonNode shop = getJson("/api/products?size=50&sellerId=" + demoSeller, null);
            assertThat(shop.get("totalItems").asInt()).isEqualTo(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM dbo.vw_ProductCatalog WHERE SellerId = ?", Integer.class, demoSeller));
            shop.get("items").forEach(i -> assertThat(i.get("seller").get("id").asInt()).isEqualTo(demoSeller));
            JsonNode range = getJson("/api/products?size=50&minPrice=100000&maxPrice=300000", null);
            assertThat(range.get("totalItems").asInt()).isEqualTo(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM dbo.vw_ProductCatalog WHERE Price BETWEEN 100000 AND 300000", Integer.class));
            prices(range).forEach(p -> assertThat(p).isBetween(100_000L, 300_000L));
        }

        @Test
        void featuredAndDealsComeFromTheDatabase() throws Exception {
            int featured = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ProductCatalog WHERE IsFeatured = 1", Integer.class);
            JsonNode page = getJson("/api/products?size=50&featured=true", null);
            assertThat(page.get("totalItems").asInt()).isEqualTo(featured);
            page.get("items").forEach(i -> assertThat(i.get("featured").asBoolean()).isTrue());
            // Deals come only from a real original price at least 40 % above the price (no invented discounts). The demo
            // database may contain seller-created listings with an original price, so the count comes from SQL.
            int deals = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ProductCatalog c JOIN dbo.Products p ON p.ProductId = c.ProductId "
                    + "WHERE p.OriginalPrice IS NOT NULL AND p.Price * 100 <= p.OriginalPrice * 60", Integer.class);
            JsonNode dealPage = getJson("/api/products?deals=true&size=50", null);
            assertThat(dealPage.get("totalItems").asInt()).isEqualTo(deals);
            dealPage.get("items").forEach(i -> assertThat(i.get("price").asLong() * 100).isLessThanOrEqualTo(i.get("originalPrice").asLong() * 60));
        }

        @Test
        void facetsCountConditionsCategoriesAndCampuses() throws Exception {
            JsonNode facets = getJson("/api/products", null).get("facets");
            assertThat(facets.get("conditions").get("NEW").asInt() + facets.get("conditions").get("LIKE_NEW").asInt()
                    + facets.get("conditions").get("USED").asInt())
                    .isEqualTo(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ProductCatalog", Integer.class));
            List<String> categoryIds = jdbc.queryForList("SELECT DISTINCT CAST(CategoryId AS varchar(10)) FROM dbo.vw_ProductCatalog", String.class);
            List<String> keys = new ArrayList<>();
            facets.get("categories").fieldNames().forEachRemaining(keys::add);
            assertThat(keys).containsExactlyInAnyOrderElementsOf(categoryIds);
            // Facets follow the keyword.
            JsonNode logitech = search("logitech").get("facets").get("categories");
            assertThat(logitech.size()).isEqualTo(jdbc.queryForObject(
                    "SELECT COUNT(DISTINCT CategoryId) FROM dbo.vw_ProductCatalog WHERE Title LIKE N'%Logitech%'", Integer.class));
        }

        @Test
        void invalidParametersAre400() throws Exception {
            mvc.perform(get("/api/products?sort=popular")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("sort"));
            mvc.perform(get("/api/products?size=51")).andExpect(status().isBadRequest());
            mvc.perform(get("/api/products?page=0")).andExpect(status().isBadRequest());
            mvc.perform(get("/api/products?condition=BROKEN")).andExpect(status().isBadRequest());
            mvc.perform(get("/api/products?minPrice=5&maxPrice=1")).andExpect(status().isBadRequest());
        }

        @Test
        void aCatalogPageUsesAConstantNumberOfQueries() throws Exception {
            Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            stats.clear();
            getJson("/api/products?size=10", null);
            long small = stats.getPrepareStatementCount();
            stats.clear();
            getJson("/api/products?size=50", null);
            long large = stats.getPrepareStatementCount();
            // 10 items: page + count + main photos; 50 items (all on one page): Spring skips the count query.
            // Either way the number does not grow with the number of items (no N+1).
            assertThat(small).as("JPA statements for 10 items").isLessThanOrEqualTo(3);
            assertThat(large).as("JPA statements for 50 items").isLessThanOrEqualTo(small);
        }
    }

    // ================================================================== product page + reference data

    @Nested
    class ProductPage {

        @Test
        void availableListingShowsSafeDetails() throws Exception {
            int id = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.vw_ProductCatalog ORDER BY ProductId", Integer.class);
            mvc.perform(get("/api/products/" + id))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(id))
                    .andExpect(jsonPath("$.purchasable").value(true))
                    .andExpect(jsonPath("$.images.length()").value(2))
                    .andExpect(jsonPath("$.images[0].sortOrder").value(0))
                    .andExpect(jsonPath("$.seller.fullName").exists())
                    // Email verification is reported as such; nothing claims student status (pending decision).
                    .andExpect(jsonPath("$.seller.emailVerified").value(true))
                    .andExpect(jsonPath("$.seller.verifiedStudent").doesNotExist())
                    .andExpect(jsonPath("$.seller.verified").doesNotExist())
                    // Demo photo references are returned root-relative; the database value is unchanged.
                    .andExpect(jsonPath("$.images[0].url").value(org.hamcrest.Matchers.startsWith("/images/demo/products/")))
                    .andExpect(jsonPath("$.seller.email").doesNotExist())
                    .andExpect(jsonPath("$.seller.phone").doesNotExist())
                    .andExpect(jsonPath("$.moderation").doesNotExist());
        }

        @Test
        void sellerContactIsShownOnlyWhenTheSellerSharesIt() throws Exception {
            String sql = "SELECT TOP 1 p.ProductId FROM dbo.vw_ProductCatalog p JOIN dbo.Users u ON u.UserId = p.SellerId "
                    + "WHERE u.ShowContact = ? AND u.Phone IS NOT NULL ORDER BY p.ProductId";
            int shared = jdbc.queryForObject(sql, Integer.class, 1);
            String phone = jdbc.queryForObject("SELECT u.Phone FROM dbo.Products p JOIN dbo.Users u ON u.UserId = p.SellerId WHERE p.ProductId = ?",
                    String.class, shared);
            mvc.perform(get("/api/products/" + shared)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.seller.contact.phone").value(phone))
                    .andExpect(jsonPath("$.seller.email").doesNotExist());
            int hidden = jdbc.queryForObject(sql, Integer.class, 0);
            mvc.perform(get("/api/products/" + hidden)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.seller.contact").doesNotExist())
                    .andExpect(jsonPath("$.seller.fullName").exists());
            // Contact details are never part of catalog items.
            assertThat(getJson("/api/products?size=50", null).toString()).doesNotContain(phone);
        }

        @Test
        void reservedAndSoldListingsAreShownButNotPurchasable() throws Exception {
            int reserved = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = 'Reserved' AND ModerationStatus = 'Approved'", Integer.class);
            int sold = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = 'Sold' AND ModerationStatus = 'Approved'", Integer.class);
            mvc.perform(get("/api/products/" + reserved)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("RESERVED")).andExpect(jsonPath("$.purchasable").value(false));
            mvc.perform(get("/api/products/" + sold)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("SOLD")).andExpect(jsonPath("$.purchasable").value(false));
        }

        @Test
        void hiddenAndMissingListingsAre404() throws Exception {
            for (String where : List.of("ModerationStatus = 'Pending'", "Status = 'Removed'", "Status = 'Draft'")) {
                int id = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE " + where + " AND ProductId <= 50", Integer.class);
                mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
            }
            mvc.perform(get("/api/products/999999")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }

        @Test
        void referenceDataComesFromTheDatabase() throws Exception {
            int activeCategories = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Categories WHERE IsActive = 1", Integer.class);
            mvc.perform(get("/api/categories")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(activeCategories))
                    .andExpect(jsonPath("$[?(@.name == 'Bikes & Ride')].slug").value("bikes-and-ride"));
            mvc.perform(get("/api/universities")).andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].code").value("FPT")).andExpect(jsonPath("$[0].campuses[0].name").value("FPT Hoa Lac"));
            mvc.perform(get("/api/campuses?universityId=1")).andExpect(status().isOk()).andExpect(jsonPath("$[0].universityId").value(1));
        }
    }

    // ================================================================== listings and photos

    @Nested
    class Listings {

        @Test
        void otherCategoryStoresTheSellerTypedNameAndOfficialCategoriesIgnoreIt() throws Exception {
            int other = jdbc.queryForObject("SELECT CategoryId FROM dbo.Categories WHERE AllowsCustomName = 1", Integer.class);
            // Reference data: Other is listed last and flagged.
            JsonNode categories = getJson("/api/categories", null);
            JsonNode last = categories.get(categories.size() - 1);
            assertThat(last.get("id").asInt()).isEqualTo(other);
            assertThat(last.get("custom").asBoolean()).isTrue();
            assertThat(categories.get(0).get("custom").asBoolean()).isFalse();

            String base = "{\"title\":\"Ukulele soprano\",\"description\":\"A clean, well kept item from a student.\",\"price\":250000,"
                    + "\"condition\":\"USED\",\"categoryId\":" + other;
            // Required, trimmed, 2-60 characters, letters or digits.
            expectFieldError(base + "}", "customCategory");
            expectFieldError(base + ",\"customCategory\":\"   \"}", "customCategory");
            expectFieldError(base + ",\"customCategory\":\"x\"}", "customCategory");
            expectFieldError(base + ",\"customCategory\":\"--- ...\"}", "customCategory");
            expectFieldError(base + ",\"customCategory\":\"" + "a".repeat(61) + "\"}", "customCategory");

            JsonNode created = readJson(mvc.perform(createRequest(base + ",\"customCategory\":\"  Nhạc \\t  cụ  \"}", photo("main.png", PNG))
                    .header("Authorization", "Bearer " + seller)).andExpect(status().isCreated()));
            int id = created.get("id").asInt();
            assertThat(created.get("category").get("id").asInt()).isEqualTo(other);
            assertThat(created.get("category").get("customName").asText()).isEqualTo("Nhạc cụ");
            assertThat(jdbc.queryForObject("SELECT CustomCategoryName FROM dbo.Products WHERE ProductId = ?", String.class, id)).isEqualTo("Nhạc cụ");
            // No new global category is created.
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Categories WHERE Name = N'Nhạc cụ'", Integer.class)).isZero();
            assertThat(getJson("/api/products/" + id, seller).get("category").get("customName").asText()).isEqualTo("Nhạc cụ");

            // Switching to an official category clears the custom name, even if a stale one is sent.
            String official = "{\"title\":\"Ukulele soprano\",\"description\":\"A clean, well kept item from a student.\",\"price\":250000,"
                    + "\"condition\":\"USED\",\"categoryId\":1,\"customCategory\":\"Nhạc cụ\"}";
            mvc.perform(put("/api/products/" + id).contentType(MediaType.APPLICATION_JSON).content(official)
                    .header("Authorization", "Bearer " + seller)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.category.id").value(1)).andExpect(jsonPath("$.category.customName").isEmpty());
            assertThat(jdbc.queryForObject("SELECT CustomCategoryName FROM dbo.Products WHERE ProductId = ?", String.class, id)).isNull();
        }

        @Test
        void visitorsCannotCreateOrChangeListings() throws Exception {
            mvc.perform(createRequest(listing("Anonymous desk lamp", 100_000), photo("a.png", PNG))).andExpect(status().isUnauthorized());
            mvc.perform(put("/api/products/1").contentType(MediaType.APPLICATION_JSON).content(listing("Hijack attempt", 1_000)))
                    .andExpect(status().isUnauthorized());
            mvc.perform(delete("/api/products/1")).andExpect(status().isUnauthorized());
        }

        @Test
        void createsAPendingListingForTheSignedInSellerOnly() throws Exception {
            String body = listing("Casio fx-580VN X calculator", 250_000).replace("{", "{\"sellerId\": 1, \"status\": \"SOLD\", ");
            JsonNode created = readJson(mvc.perform(createRequest(body, photo("front.png", PNG), photo("back.jpg", JPEG))
                            .header("Authorization", "Bearer " + seller))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("AVAILABLE"))
                    .andExpect(jsonPath("$.moderation").value("PENDING"))
                    .andExpect(jsonPath("$.seller.id").value(sellerId))
                    .andExpect(jsonPath("$.images.length()").value(2))
                    .andExpect(jsonPath("$.images[0].url").value(org.hamcrest.Matchers.matchesPattern("^/media/products/[0-9a-f]{32}\\.png$")))
                    .andExpect(jsonPath("$.images[1].url").value(org.hamcrest.Matchers.endsWith(".jpg"))));
            int id = created.get("id").asInt();
            assertThat(jdbc.queryForObject("SELECT SellerId FROM dbo.Products WHERE ProductId = ?", Integer.class, id)).isEqualTo(sellerId);
            // Pending: not public, not in the catalog, but in "My listings" and visible to its seller.
            mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
            mvc.perform(get("/api/products/" + id).header("Authorization", "Bearer " + seller)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.moderation").value("PENDING")).andExpect(jsonPath("$.editable").value(true));
            JsonNode mine = getJson("/api/me/products", seller);
            assertThat(mine.findValues("id").stream().map(JsonNode::asInt).toList()).contains(id);
            // The stored file is served publicly with an image content type.
            String url = created.get("images").get(0).get("url").asText();
            ResponseEntity<byte[]> file = rest.getForEntity(url, byte[].class);
            assertThat(file.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(file.getBody()).isEqualTo(PNG);
            assertThat(file.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
            assertThat(file.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        }

        @Test
        void photoFilesCannotBeUsedToReadOtherFiles() throws Exception {
            // A file outside the photo folder, reachable only through "..".
            Files.writeString(uploadDir.resolve("secret.txt"), "top secret");
            for (String path : List.of("/media/products/..%2Fsecret.txt", "/media/products/%2e%2e/secret.txt",
                    "/media/products/..%5Csecret.txt", "/media/products/%2e%2e%2fsecret.txt")) {
                ResponseEntity<String> response = rest.exchange(
                        org.springframework.http.RequestEntity.get(java.net.URI.create(rest.getRootUri() + path)).build(), String.class);
                assertThat(response.getStatusCode().is4xxClientError()).as(path).isTrue();
                assertThat(response.getBody()).as(path).doesNotContain("top secret");
            }
            assertThat(rest.getForEntity("/media/products/00000000000000000000000000000000.png", String.class).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void oversizedPhotoIsRefusedEvenWithoutTheServerLimit() throws Exception {
            // MockMvc bypasses Tomcat's multipart limit, so this reaches the service's own size check.
            byte[] big = new byte[5 * 1024 * 1024 + 1];
            System.arraycopy(PNG, 0, big, 0, PNG.length);
            mvc.perform(createRequest(listing("Oversized photo listing", 100_000), photo("big.png", big)).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("IMAGE_TOO_LARGE"));
        }

        @Test
        void invalidListingDataIsRejected() throws Exception {
            expectFieldError(listing("abc", 100_000), "title");
            expectFieldError(listing("Too cheap pencil case", 500), "price");
            expectFieldError(listing("Expensive pencil case", 200_000_000), "price");
            expectFieldError(listing("Pencil case with bad original", 100_000).replace("\"originalPrice\":null", "\"originalPrice\":90000"),
                    "originalPriceHigherThanPrice");
            expectFieldError(listing("Pencil case short text", 100_000).replace("A clean, well kept item from a student.", "short"), "description");
            mvc.perform(createRequest(listing("Pencil case bad category", 100_000).replace("\"categoryId\":1", "\"categoryId\":999"),
                            photo("a.png", PNG)).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CATEGORY"));
            mvc.perform(createRequest(listing("Pencil case bad campus", 100_000).replace("\"campusId\":null", "\"campusId\":999"),
                            photo("a.png", PNG)).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CAMPUS"));
            mvc.perform(createRequest(listing("Pencil case bad condition", 100_000).replace("\"USED\"", "\"BROKEN\""),
                            photo("a.png", PNG)).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest());
        }

        @Test
        void photosAreValidatedByContentCountAndSize() throws Exception {
            long rowsBefore = countListingsOf(sellerId);
            long filesBefore = filesOnDisk();
            // A text file pretending to be a JPEG (name and Content-Type are ignored; the bytes decide).
            MockMultipartFile fake = new MockMultipartFile("photos", "photo.jpg", "image/jpeg", "not an image".getBytes(StandardCharsets.UTF_8));
            mvc.perform(createRequest(listing("Fake photo listing", 100_000), fake).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_IMAGE"));
            MockMultipartFile[] nine = new MockMultipartFile[9];
            for (int i = 0; i < 9; i++) nine[i] = photo("p" + i + ".png", PNG);
            mvc.perform(createRequest(listing("Nine photos listing", 100_000), nine).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TOO_MANY_IMAGES"));
            mvc.perform(multipart("/api/products").file(new MockMultipartFile("listing", "", "application/json",
                            listing("No photo listing", 100_000).getBytes(StandardCharsets.UTF_8))).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest());
            assertThat(countListingsOf(sellerId)).isEqualTo(rowsBefore);
            assertThat(filesOnDisk()).as("no file left behind by rejected uploads").isEqualTo(filesBefore);

            // Larger than 5 MB: refused by the multipart limit over real HTTP.
            byte[] big = new byte[5 * 1024 * 1024 + 10];
            System.arraycopy(PNG, 0, big, 0, PNG.length);
            MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
            HttpHeaders jsonPart = new HttpHeaders();
            jsonPart.setContentType(MediaType.APPLICATION_JSON);
            form.add("listing", new HttpEntity<>(listing("Huge photo listing", 100_000), jsonPart));
            form.add("photos", new ByteArrayResource(big) { @Override public String getFilename() { return "big.png"; } });
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(seller);
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            ResponseEntity<String> tooBig = rest.exchange("/api/products", HttpMethod.POST, new HttpEntity<>(form, headers), String.class);
            assertThat(tooBig.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
            assertThat(tooBig.getBody()).contains("IMAGE_TOO_LARGE");
        }

        @Test
        void ownerEditsAndTheListingGoesBackToModeration() throws Exception {
            int id = createListing(seller, "Desk lamp for editing", 120_000);
            jdbc.update("UPDATE dbo.Products SET ModerationStatus = 'Approved' WHERE ProductId = ?", id);
            mvc.perform(put("/api/products/" + id).header("Authorization", "Bearer " + seller)
                            .contentType(MediaType.APPLICATION_JSON).content(listing("Desk lamp, edited title", 99_000)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.title").value("Desk lamp, edited title"))
                    .andExpect(jsonPath("$.price").value(99_000))
                    .andExpect(jsonPath("$.moderation").value("PENDING"));
        }

        @Test
        void anotherStudentCannotChangeSomeoneElsesListingButAnAdminCan() throws Exception {
            int id = createListing(seller, "Backpack owned by A", 150_000);
            jdbc.update("UPDATE dbo.Products SET ModerationStatus = 'Approved' WHERE ProductId = ?", id);
            mvc.perform(put("/api/products/" + id).header("Authorization", "Bearer " + otherStudent)
                    .contentType(MediaType.APPLICATION_JSON).content(listing("Stolen backpack", 1_000)))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
            mvc.perform(delete("/api/products/" + id).header("Authorization", "Bearer " + otherStudent)).andExpect(status().isForbidden());
            mvc.perform(multipart("/api/products/" + id + "/images").file(photo("x.png", PNG)).header("Authorization", "Bearer " + otherStudent))
                    .andExpect(status().isForbidden());
            assertThat(jdbc.queryForObject("SELECT Title FROM dbo.Products WHERE ProductId = ?", String.class, id)).isEqualTo("Backpack owned by A");
            // While pending, other students do not even learn that it exists.
            jdbc.update("UPDATE dbo.Products SET ModerationStatus = 'Pending' WHERE ProductId = ?", id);
            mvc.perform(put("/api/products/" + id).header("Authorization", "Bearer " + otherStudent)
                    .contentType(MediaType.APPLICATION_JSON).content(listing("Stolen backpack", 1_000))).andExpect(status().isNotFound());
            mvc.perform(put("/api/products/" + id).header("Authorization", "Bearer " + admin)
                    .contentType(MediaType.APPLICATION_JSON).content(listing("Backpack fixed by admin", 150_000))).andExpect(status().isOk());
        }

        @Test
        void reservedOrSoldListingsCannotBeChangedOrRemoved() throws Exception {
            for (String state : List.of("Reserved", "Sold")) {
                int id = createListing(seller, "Listing that becomes " + state, 80_000);
                jdbc.update("UPDATE dbo.Products SET Status = ?, ModerationStatus = 'Approved' WHERE ProductId = ?", state, id);
                mvc.perform(put("/api/products/" + id).header("Authorization", "Bearer " + seller)
                                .contentType(MediaType.APPLICATION_JSON).content(listing("Changed after sale", 1_000)))
                        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_NOT_EDITABLE"));
                mvc.perform(delete("/api/products/" + id).header("Authorization", "Bearer " + seller)).andExpect(status().isConflict());
                mvc.perform(multipart("/api/products/" + id + "/images").file(photo("x.png", PNG)).header("Authorization", "Bearer " + seller))
                        .andExpect(status().isConflict());
                assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Products WHERE ProductId = ?", String.class, id)).isEqualTo(state);
            }
        }

        @Test
        void listingInARealCheckoutIsReservedAndProtected() throws Exception {
            int id = createListing(seller, "Lamp bought through checkout", 60_000);
            jdbc.update("UPDATE dbo.Products SET ModerationStatus = 'Approved' WHERE ProductId = ?", id);
            Integer buyer = newUser("Student", "Checkout Buyer");
            // V003: checkout through usp_CheckoutWithShipping (free delivery inside the listing's own area).
            jdbc.execute("DECLARE @ids dbo.ProductIdList, @ship dbo.SellerShippingList, @zone int; INSERT @ids VALUES (" + id + "); "
                    + "SELECT @zone = COALESCE(p.PickupZoneId, ca.ZoneId) FROM dbo.Products p LEFT JOIN dbo.Campuses ca ON ca.CampusId = p.CampusId "
                    + "WHERE p.ProductId = " + id + "; "
                    + "INSERT @ship SELECT SellerId, 'STANDARD_SIM', @zone, 0.0, 0, 'SIM-2026-11' FROM dbo.Products WHERE ProductId = " + id + "; "
                    + "EXEC dbo.usp_CheckoutWithShipping @BuyerId = " + buyer + ", @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zone, "
                    + "@RecipientName = N'Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm'");
            mvc.perform(delete("/api/products/" + id).header("Authorization", "Bearer " + seller)).andExpect(status().isConflict());
            mvc.perform(get("/api/products/" + id)).andExpect(jsonPath("$.status").value("RESERVED")).andExpect(jsonPath("$.purchasable").value(false));
        }

        @Test
        void removingIsASoftDelete() throws Exception {
            int id = createListing(seller, "Listing to be removed", 70_000);
            mvc.perform(delete("/api/products/" + id).header("Authorization", "Bearer " + seller)).andExpect(status().isNoContent());
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Products WHERE ProductId = ?", String.class, id)).isEqualTo("Removed");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.ProductImages WHERE ProductId = ?", Integer.class, id)).isEqualTo(1);
            mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
            assertThat(getJson("/api/me/products", seller).findValues("id").stream().map(JsonNode::asInt).toList()).doesNotContain(id);
        }

        @Test
        void photosCanBeAddedReorderedAndDeletedWithinTheLimits() throws Exception {
            int id = createListing(seller, "Listing with many photos", 90_000);
            JsonNode added = readJson(mvc.perform(multipart("/api/products/" + id + "/images")
                            .file(photo("2.png", PNG)).file(photo("3.webp", WEBP)).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.images.length()").value(3)));
            List<Integer> imageIds = new ArrayList<>();
            added.get("images").forEach(i -> imageIds.add(i.get("id").asInt()));
            // New order: last photo first -> it becomes the main photo.
            List<Integer> reordered = List.of(imageIds.get(2), imageIds.get(0), imageIds.get(1));
            mvc.perform(put("/api/products/" + id + "/images/order").header("Authorization", "Bearer " + seller)
                            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("imageIds", reordered))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.images[0].id").value(imageIds.get(2)))
                    .andExpect(jsonPath("$.images[0].url").value(org.hamcrest.Matchers.endsWith(".webp")));
            mvc.perform(put("/api/products/" + id + "/images/order").header("Authorization", "Bearer " + seller)
                            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("imageIds", List.of(imageIds.get(0))))))
                    .andExpect(status().isBadRequest());
            // Up to 8 photos in total.
            MockMultipartHttpServletRequestBuilder six = multipart("/api/products/" + id + "/images");
            for (int i = 0; i < 6; i++) six.file(photo("x" + i + ".png", PNG));
            mvc.perform(six.header("Authorization", "Bearer " + seller)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TOO_MANY_IMAGES"));
            // Delete down to one photo; the last one cannot be deleted.
            String deletedUrl = added.get("images").get(0).get("url").asText();
            mvc.perform(delete("/api/products/" + id + "/images/" + imageIds.get(0)).header("Authorization", "Bearer " + seller)).andExpect(status().isOk());
            assertThat(Files.exists(uploadDir.resolve("products").resolve(deletedUrl.substring("/media/products/".length())))).isFalse();
            mvc.perform(delete("/api/products/" + id + "/images/" + imageIds.get(1)).header("Authorization", "Bearer " + seller)).andExpect(status().isOk());
            mvc.perform(delete("/api/products/" + id + "/images/" + imageIds.get(2)).header("Authorization", "Bearer " + seller))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IMAGE_REQUIRED"));
        }
    }

    // ================================================================== favorites

    @Nested
    class PhotoPrivacy {

        /** A small JPEG whose APP1 segment carries EXIF GPS coordinates (as phones write them). */
        private byte[] jpegWithGps() {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            out.writeBytes(new byte[]{(byte) 0xFF, (byte) 0xD8});
            byte[] exif = "Exif\0\0GPSLatitude=21.0285;GPSLongitude=105.8542".getBytes(StandardCharsets.ISO_8859_1);
            out.writeBytes(new byte[]{(byte) 0xFF, (byte) 0xE1, (byte) ((exif.length + 2) >> 8), (byte) (exif.length + 2)});
            out.writeBytes(exif);
            out.writeBytes(new byte[]{(byte) 0xFF, (byte) 0xDA, 0, 5, 1, 2, 3, 0x11, 0x22, (byte) 0xFF, (byte) 0xD9});
            return out.toByteArray();
        }

        @Test
        void uploadedPhotosAreStoredWithoutGpsMetadata() throws Exception {
            JsonNode created = readJson(mvc.perform(createRequest(listing("Photo privacy lamp", 90_000), photo("phone.jpg", jpegWithGps()))
                    .header("Authorization", "Bearer " + seller)).andExpect(status().isCreated()));
            String url = created.get("images").get(0).get("url").asText();
            Path stored = uploadDir.resolve("products").resolve(url.substring("/media/products/".length()));
            byte[] bytes = Files.readAllBytes(stored);
            assertThat(new String(bytes, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLatitude").doesNotContain("Exif");
            assertThat(bytes[0] & 0xFF).isEqualTo(0xFF);
            assertThat(bytes[1] & 0xFF).isEqualTo(0xD8);
            assertThat(url).endsWith(".jpg");
        }
    }

    @Nested
    class Favorites {

        @Test
        void favoritesNeedASignedInUser() throws Exception {
            mvc.perform(get("/api/me/favorites")).andExpect(status().isUnauthorized());
            mvc.perform(put("/api/me/favorites/1")).andExpect(status().isUnauthorized());
        }

        @Test
        void addListRemoveWithoutDuplicates() throws Exception {
            String user = token(emailOf(newUser("Student", "Favorite Tester")));
            Integer userId = jdbc.queryForObject("SELECT MAX(UserId) FROM dbo.Users", Integer.class);
            int product = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.vw_ProductCatalog ORDER BY ProductId DESC", Integer.class);
            mvc.perform(get("/api/me/favorites").header("Authorization", "Bearer " + user)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
            mvc.perform(put("/api/me/favorites/" + product).header("Authorization", "Bearer " + user))
                    .andExpect(status().isCreated()).andExpect(jsonPath("$.created").value(true));
            mvc.perform(put("/api/me/favorites/" + product).header("Authorization", "Bearer " + user))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(false));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Favorites WHERE UserId = ?", Integer.class, userId)).isEqualTo(1);
            mvc.perform(get("/api/me/favorites").header("Authorization", "Bearer " + user))
                    .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(product));
            // Another user does not see it and cannot remove it (paths only address one's own favorites).
            mvc.perform(get("/api/me/favorites").header("Authorization", "Bearer " + otherStudent))
                    .andExpect(jsonPath("$[?(@.id == " + product + ")]").isEmpty());
            mvc.perform(delete("/api/me/favorites/" + product).header("Authorization", "Bearer " + otherStudent)).andExpect(status().isNoContent());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Favorites WHERE UserId = ?", Integer.class, userId)).isEqualTo(1);
            mvc.perform(delete("/api/me/favorites/" + product).header("Authorization", "Bearer " + user)).andExpect(status().isNoContent());
            mvc.perform(delete("/api/me/favorites/" + product).header("Authorization", "Bearer " + user)).andExpect(status().isNoContent());
            mvc.perform(get("/api/me/favorites").header("Authorization", "Bearer " + user)).andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        void hiddenOrMissingListingsCannotBeSavedAndReservedOnesShowTheirStatus() throws Exception {
            int pending = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE ModerationStatus = 'Pending' AND ProductId <= 50", Integer.class);
            mvc.perform(put("/api/me/favorites/" + pending).header("Authorization", "Bearer " + otherStudent)).andExpect(status().isNotFound());
            mvc.perform(put("/api/me/favorites/999999").header("Authorization", "Bearer " + otherStudent)).andExpect(status().isNotFound());
            int reserved = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = 'Reserved' AND ModerationStatus = 'Approved'", Integer.class);
            mvc.perform(put("/api/me/favorites/" + reserved).header("Authorization", "Bearer " + otherStudent)).andExpect(status().isCreated());
            mvc.perform(get("/api/me/favorites").header("Authorization", "Bearer " + otherStudent))
                    .andExpect(jsonPath("$[?(@.id == " + reserved + ")].purchasable").value(false));
        }
    }

    // ================================================================== helpers

    private Integer newUser(String role, String name) {
        String email = "it-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20) + "@fpt.edu.vn";
        jdbc.update("INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, Role, Status, EmailVerifiedAt) "
                + "VALUES (?, ?, ?, 1, ?, 'Active', SYSUTCDATETIME())", email, passwordEncoder.encode("Secret123"), name, role);
        return jdbc.queryForObject("SELECT UserId FROM dbo.Users WHERE Email = ?", Integer.class, email);
    }

    private String emailOf(Integer userId) {
        return jdbc.queryForObject("SELECT Email FROM dbo.Users WHERE UserId = ?", String.class, userId);
    }

    private String token(String email) throws Exception {
        return readJson(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", "Secret123")))).andExpect(status().isOk()))
                .get("accessToken").asText();
    }

    private String listing(String title, long price) {
        return "{\"title\":\"" + title + "\",\"description\":\"A clean, well kept item from a student.\",\"price\":" + price
                + ",\"originalPrice\":null,\"condition\":\"USED\",\"categoryId\":1,\"campusId\":null}";
    }

    private static MockMultipartFile photo(String name, byte[] content) {
        return new MockMultipartFile("photos", name, "application/octet-stream", content);
    }

    private MockHttpServletRequestBuilder createRequest(String listingJson, MockMultipartFile... photos) {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/products")
                .file(new MockMultipartFile("listing", "", "application/json", listingJson.getBytes(StandardCharsets.UTF_8)));
        for (MockMultipartFile photo : photos) {
            request.file(photo);
        }
        return request;
    }

    private int createListing(String token, String title, long price) throws Exception {
        return readJson(mvc.perform(createRequest(listing(title, price), photo("main.png", PNG)).header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())).get("id").asInt();
    }

    private void expectFieldError(String listingJson, String field) throws Exception {
        mvc.perform(createRequest(listingJson, photo("a.png", PNG)).header("Authorization", "Bearer " + seller))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[?(@.field == '" + field + "')]").exists());
    }

    private JsonNode getJson(String url, String token) throws Exception {
        MockHttpServletRequestBuilder request = get(url);
        if (token != null) request.header("Authorization", "Bearer " + token);
        return readJson(mvc.perform(request).andExpect(status().isOk()));
    }

    private JsonNode search(String keyword) throws Exception {
        return readJson(mvc.perform(get("/api/products").param("size", "50").param("q", keyword)).andExpect(status().isOk()));
    }

    private List<JsonNode> allItems(String query) throws Exception {
        List<JsonNode> items = new ArrayList<>();
        for (int page = 1; ; page++) {
            JsonNode result = getJson("/api/products?size=50&page=" + page + query, null);
            result.get("items").forEach(items::add);
            if (page >= result.get("totalPages").asInt()) return items;
        }
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static List<Integer> ids(JsonNode page) {
        List<Integer> ids = new ArrayList<>();
        page.get("items").forEach(i -> ids.add(i.get("id").asInt()));
        return ids;
    }

    private static List<Long> prices(JsonNode page) {
        List<Long> prices = new ArrayList<>();
        page.get("items").forEach(i -> prices.add(i.get("price").asLong()));
        return prices;
    }

    private long countListingsOf(Integer userId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Products WHERE SellerId = ?", Long.class, userId);
    }

    private long filesOnDisk() throws IOException {
        Path dir = uploadDir.resolve("products");
        if (!Files.exists(dir)) return 0;
        try (var files = Files.list(dir)) {
            return files.count();
        }
    }

    /** Checksum of the demo rows: users 1-17, listings 1-50 and their photos. */
    private String demoChecksum() {
        Map<String, Object> row = new HashMap<>(jdbc.queryForMap("SELECT "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(UserId, Email, PasswordHash, FullName, Role, Status, EmailVerifiedAt, CampusId, UpdatedAt)) FROM dbo.Users WHERE UserId <= 17) AS users, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, CategoryId, CampusId, Title, Price, OriginalPrice, Condition, Status, ModerationStatus, UpdatedAt)) FROM dbo.Products WHERE ProductId <= 50) AS products, "
                + "(SELECT CHECKSUM_AGG(CHECKSUM(ImageId, ProductId, ImageUrl, SortOrder)) FROM dbo.ProductImages WHERE ProductId <= 50) AS images"));
        return row.toString();
    }
}
