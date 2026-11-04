package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V004 buyer / seller chat and chat reports, end to end against a real SQL Server database.
 *
 * <p>Writes data: runs only with {@code UNIMARKET_WRITE_IT=true} and refuses any database whose name does not contain
 * "Test".</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_WRITE_IT", matches = "true")
@SpringBootTest
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ChatIntegrationTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder passwordEncoder;

    private int sellerId;
    private int buyerId;
    private String seller;
    private String buyer;
    private String stranger;
    private String admin;

    @BeforeAll
    void setUp() throws Exception {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
        sellerId = newUser("Student", "Chat Seller");
        seller = token(sellerId);
        buyerId = newUser("Student", "Chat Buyer");
        buyer = token(buyerId);
        stranger = token(newUser("Student", "Chat Stranger"));
        admin = token(newUser("Admin", "Chat Admin"));
    }

    @Test
    void buyerAndSellerChatWithUnreadCountsAndPolling() throws Exception {
        // Own seller: the unread total covers all of a user's conversations, other tests must not add to it.
        int sellerId = newUser("Student", "Chat Seller (unread)");
        String seller = token(sellerId);
        int listing = listing(sellerId, "Available");
        JsonNode started = readJson(start(buyer, listing).andExpect(status().isOk()));
        int id = started.get("id").asInt();
        assertThat(started.get("myRole").asText()).isEqualTo("BUYER");
        assertThat(started.get("counterpart").get("id").asInt()).isEqualTo(sellerId);
        assertThat(readJson(start(buyer, listing)).get("id").asInt()).as("one conversation per listing and buyer").isEqualTo(id);

        // The seller does not see an empty conversation.
        assertThat(ids(getJson("/api/conversations", seller))).doesNotContain((long) id);

        long first = readJson(send(buyer, id, "  Is this still available?  ").andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("Is this still available?")).andExpect(jsonPath("$.mine").value(true))).get("id").asLong();
        assertThat(getJson("/api/conversations/unread-count", seller).get("count").asInt()).isEqualTo(1);
        JsonNode sellerView = getJson("/api/conversations/" + id, seller);
        assertThat(sellerView.get("myRole").asText()).isEqualTo("SELLER");
        assertThat(sellerView.get("unreadCount").asInt()).isEqualTo(1);
        assertThat(sellerView.get("lastMessage").get("mine").asBoolean()).isFalse();

        long reply = readJson(send(seller, id, "Yes, you can order it now.").andExpect(status().isCreated())).get("id").asLong();
        JsonNode newer = getJson("/api/conversations/" + id + "/messages?after=" + first, buyer);
        assertThat(newer).hasSize(1);
        assertThat(newer.get(0).get("id").asLong()).isEqualTo(reply);
        assertThat(getJson("/api/conversations/" + id + "/messages", buyer)).hasSize(2);

        assertThat(getJson("/api/conversations/unread-count", seller).get("count").asInt()).as("sending reads the conversation").isZero();
        assertThat(getJson("/api/conversations/" + id, buyer).get("unreadCount").asInt()).isEqualTo(1);
        mvc.perform(post("/api/conversations/" + id + "/read").header("Authorization", bearer(buyer))).andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
        assertThat(ids(getJson("/api/conversations", seller))).contains((long) id);
    }

    @Test
    void onlyParticipantsAndOnlyValidListings() throws Exception {
        int own = listing(buyerId, "Available");
        start(buyer, own).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHAT_NOT_ALLOWED"));
        start(buyer, listing(sellerId, "Sold")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHAT_NOT_ALLOWED"));
        start(admin, listing(sellerId, "Available")).andExpect(status().isConflict());
        int id = readJson(start(buyer, listing(sellerId, "Available"))).get("id").asInt();

        mvc.perform(get("/api/conversations/" + id).header("Authorization", bearer(stranger))).andExpect(status().isNotFound());
        send(stranger, id, "hello").andExpect(status().isNotFound());
        send(buyer, id, "   ").andExpect(status().isBadRequest());
        send(buyer, id, "x".repeat(2001)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/conversations")).andExpect(status().isUnauthorized());
    }

    @Test
    void reportedConversationGoesThroughTheAdminReportFlow() throws Exception {
        int id = readJson(start(buyer, listing(sellerId, "Available"))).get("id").asInt();
        send(buyer, id, "Can I pay you by bank transfer directly?").andExpect(status().isCreated());

        // Nothing from the other side yet: the buyer cannot report; the seller can.
        report(buyer, id).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/conversations/" + id).header("Authorization", bearer(admin))).andExpect(status().isNotFound());
        report(stranger, id).andExpect(status().isNotFound());

        JsonNode created = readJson(report(seller, id).andExpect(status().isCreated()));
        long reportId = created.get("id").asLong();
        assertThat(created.get("targetType").asText()).isEqualTo("CONVERSATION");
        report(seller, id).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REPORT_ALREADY_OPEN"));

        JsonNode detail = getJson("/api/admin/reports/" + reportId, admin);
        assertThat(detail.get("target").get("id").asInt()).isEqualTo(id);
        assertThat(detail.get("target").get("owner").get("id").asInt()).as("the reported person").isEqualTo(buyerId);
        assertThat(detail.get("reasonCode").asText()).isEqualTo("OFF_PLATFORM_PAYMENT");
        assertThat(ids(getJson("/api/admin/reports?targetType=CONVERSATION&size=100&status=ALL", admin))).contains(reportId);
        assertThat(ids(getJson("/api/admin/reports?targetType=USER&size=100&status=ALL", admin))).doesNotContain(reportId);

        mvc.perform(get("/api/admin/conversations/" + id).header("Authorization", bearer(seller))).andExpect(status().isForbidden());
        JsonNode chat = getJson("/api/admin/conversations/" + id, admin);
        assertThat(chat.get("messages")).hasSize(1);
        assertThat(chat.get("buyer").get("id").asInt()).isEqualTo(buyerId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.AdminActions WHERE EntityType = 'Conversation' AND EntityId = ?", Integer.class, id))
                .as("admin reads are audited").isEqualTo(1);

        mvc.perform(post("/api/admin/reports/" + reportId + "/review").header("Authorization", bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REVIEWING"));
        mvc.perform(post("/api/admin/reports/" + reportId + "/resolve").header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"Buyer warned about off-platform payment.\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"));
        assertThat(getJson("/api/me/reports", seller).toString()).contains("\"targetType\":\"CONVERSATION\"");
    }

    // ------------------------------------------------------------------ helpers

    private ResultActions start(String token, int productId) throws Exception {
        return mvc.perform(post("/api/conversations").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"productId\":" + productId + "}"));
    }

    private ResultActions send(String token, int conversationId, String body) throws Exception {
        return mvc.perform(post("/api/conversations/" + conversationId + "/messages").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("body", body))));
    }

    private ResultActions report(String token, int conversationId) throws Exception {
        return mvc.perform(post("/api/reports").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetType\":\"CONVERSATION\",\"targetId\":" + conversationId + ",\"reason\":\"OFF_PLATFORM_PAYMENT\",\"details\":\"Asked me to pay outside UniMarket.\"}"));
    }

    private int listing(int owner, String status) {
        return jdbc.queryForObject("INSERT dbo.Products (SellerId, CategoryId, CampusId, Title, Description, Condition, Price, Status, ModerationStatus) "
                + "OUTPUT inserted.ProductId VALUES (?, 1, 1, N'Chat test lamp', N'A clean, well kept item from a student.', 'Used', 50000, ?, 'Approved')",
                Integer.class, owner, status);
    }

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

    private JsonNode getJson(String url, String token) throws Exception {
        return readJson(mvc.perform(get(url).header("Authorization", bearer(token))).andExpect(status().isOk()));
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static java.util.List<Long> ids(JsonNode body) {
        java.util.List<Long> ids = new java.util.ArrayList<>();
        (body.has("items") ? body.get("items") : body).forEach(o -> ids.add(o.get("id").asLong()));
        return ids;
    }
}
