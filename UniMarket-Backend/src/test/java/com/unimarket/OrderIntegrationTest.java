package com.unimarket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimarket.service.order.OrderExpiryService;
import com.unimarket.service.order.OrderProcedures;
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
import org.springframework.context.ApplicationContext;
import org.springframework.dao.DataAccessException;
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
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Stage 4 end-to-end tests: cart, checkout, orders, simulated payments, expiry, delivery, completion, disputes,
 * against a real SQL Server database and the real V002 procedures.
 *
 * <p>They write data, so they run only with {@code UNIMARKET_WRITE_IT=true} and refuse to start unless the database
 * name contains "Test". Test users and listings are created here; demo rows (users 1–17, listings 1–50, orders 1–12,
 * their payments, settlements and carts) are only read and compared before and after. Deadlines are tested by moving
 * the timestamps of test orders back in time. The expiry scheduler is off in tests; expiry is run explicitly.</p>
 */
@EnabledIfEnvironmentVariable(named = "UNIMARKET_WRITE_IT", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"unimarket.payment.simulator.enabled=true"})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OrderIntegrationTest {

    /** V003: every test listing is at campus 1 (area HN-HOA-LAC); the buyer delivers to HN-CAU-GIAY with STANDARD_SIM. */
    private static final String DELIVERY_ZONE_CODE = "HN-CAU-GIAY";
    private static final String CARRIER = "STANDARD_SIM";
    /** Simulated fee of one order for that route, derived from the zone coordinates in the database (formula SIM-2026-11). */
    private long FEE;
    private int deliveryZone;
    private int pickupZone;
    private int distanceTenths;

    @Autowired private MockMvc mvc;
    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private PaymentSimulator simulator;
    @Autowired private OrderExpiryService expiry;
    @Autowired private OrderProcedures procedures;
    @Autowired private ApplicationContext context;

    private String demoChecksum;
    private int sellerA;
    private int sellerB;
    private int buyer;
    private String sellerAToken;
    private String sellerBToken;
    private String buyerToken;
    private String strangerToken;
    private String adminToken;

    @BeforeAll
    void setUp() throws Exception {
        assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).as("writes data: *Test copies only").contains("Test");
        // Bring the copy to the state the live expiry job would produce, so demo rows are stable during the tests.
        expiry.expireOverdueOrders();
        demoChecksum = demoChecksum();
        deliveryZone = jdbc.queryForObject("SELECT ZoneId FROM dbo.LocationZones WHERE Code = ?", Integer.class, DELIVERY_ZONE_CODE);
        pickupZone = jdbc.queryForObject("SELECT ZoneId FROM dbo.Campuses WHERE CampusId = 1", Integer.class);
        Map<String, Object> from = jdbc.queryForMap("SELECT Latitude, Longitude FROM dbo.LocationZones WHERE ZoneId = ?", pickupZone);
        Map<String, Object> to = jdbc.queryForMap("SELECT Latitude, Longitude FROM dbo.LocationZones WHERE ZoneId = ?", deliveryZone);
        distanceTenths = com.unimarket.service.shipping.ShippingCalculator.distanceTenths(false,
                ((BigDecimal) from.get("Latitude")).doubleValue(), ((BigDecimal) from.get("Longitude")).doubleValue(),
                ((BigDecimal) to.get("Latitude")).doubleValue(), ((BigDecimal) to.get("Longitude")).doubleValue());
        FEE = com.unimarket.service.shipping.ShippingCalculator.fee(
                com.unimarket.service.shipping.ShippingCalculator.Carrier.valueOf(CARRIER), distanceTenths).orElseThrow();
        assertThat(FEE).as("the test route must not be free, so fees are visible in every amount").isPositive();
        sellerA = newUser("Student", "Seller A");
        sellerB = newUser("Student", "Seller B");
        buyer = newUser("Student", "Buyer");
        sellerAToken = token(sellerA);
        sellerBToken = token(sellerB);
        buyerToken = token(buyer);
        strangerToken = token(newUser("Student", "Stranger"));
        adminToken = token(newUser("Admin", "Order Admin"));
    }

    @AfterAll
    void demoDataUnchanged() {
        assertThat(demoChecksum()).as("demo users, listings, orders, payments, settlements and carts must not change").isEqualTo(demoChecksum);
    }

    // ================================================================== cart

    @Nested
    class Cart {

        @Test
        void cartNeedsASignedInUser() throws Exception {
            mvc.perform(get("/api/cart")).andExpect(status().isUnauthorized());
            mvc.perform(put("/api/cart/items/1")).andExpect(status().isUnauthorized());
        }

        @Test
        void addingIsIdempotentAndTheCartIsGroupedBySeller() throws Exception {
            String me = token(newUser("Student", "Cart Owner"));
            int a1 = listing(sellerA, "Cart lamp", 100_000);
            int a2 = listing(sellerA, "Cart kettle", 50_000);
            int b1 = listing(sellerB, "Cart chair", 70_000);
            for (int id : List.of(a1, a2, b1)) {
                mvc.perform(put("/api/cart/items/" + id).header("Authorization", bearer(me)))
                        .andExpect(status().isCreated()).andExpect(jsonPath("$.added").value(true));
            }
            mvc.perform(put("/api/cart/items/" + a1).header("Authorization", bearer(me)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.added").value(false));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.CartItems WHERE ProductId = ?", Integer.class, a1)).isEqualTo(1);
            JsonNode cart = getJson("/api/cart", me);
            assertThat(cart.get("itemCount").asInt()).isEqualTo(3);
            assertThat(cart.get("groups")).hasSize(2);
            JsonNode groupA = cart.get("groups").get(0);
            assertThat(groupA.get("seller").get("id").asInt()).isEqualTo(sellerA);
            assertThat(groupA.get("subtotal").asLong()).isEqualTo(150_000);
            assertThat(groupA.get("shippingFee").asLong()).as("V003: shipping is quoted per seller later").isZero();
            assertThat(groupA.get("total").asLong()).isEqualTo(150_000);
            assertThat(cart.get("subtotal").asLong()).isEqualTo(220_000);
            assertThat(cart.get("shippingFee").asLong()).isZero();
            assertThat(cart.get("total").asLong()).isEqualTo(220_000);
            // V003: simulated distance-based quotes, not included until the buyer chooses a delivery area and carrier.
            JsonNode policy = cart.get("shippingFeePolicy");
            assertThat(policy.get("method").asText()).isEqualTo("SIMULATED_DISTANCE");
            assertThat(policy.get("simulated").asBoolean()).isTrue();
            assertThat(policy.get("freeRadiusKm").asInt()).isEqualTo(3);
            assertThat(policy.get("included").asBoolean()).isFalse();
            // Checkout preview before confirming: one order per seller, each with its fee.
            JsonNode preview = readJson(mvc.perform(post("/api/cart/validate").header("Authorization", bearer(me))).andExpect(status().isOk()));
            assertThat(preview.get("ready").asBoolean()).isTrue();
            assertThat(preview.get("groups")).hasSize(2);
            assertThat(preview.get("shippingFee").asLong()).isZero();
            assertThat(preview.get("total").asLong()).isEqualTo(220_000);
            assertThat(preview.get("shippingFeePolicy").get("included").asBoolean()).isFalse();
        }

        @Test
        void ownHiddenUnavailableOrUnknownListingsAreRefused() throws Exception {
            int own = listing(buyer, "Buyer's own desk", 90_000);
            mvc.perform(put("/api/cart/items/" + own).header("Authorization", bearer(buyerToken)))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OWN_LISTING"));
            int reserved = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = 'Reserved' AND ModerationStatus = 'Approved'", Integer.class);
            mvc.perform(put("/api/cart/items/" + reserved).header("Authorization", bearer(buyerToken)))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_UNAVAILABLE"));
            int pending = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE ModerationStatus = 'Pending' AND ProductId <= 50", Integer.class);
            mvc.perform(put("/api/cart/items/" + pending).header("Authorization", bearer(buyerToken))).andExpect(status().isNotFound());
            mvc.perform(put("/api/cart/items/999999").header("Authorization", bearer(buyerToken))).andExpect(status().isNotFound());
        }

        @Test
        void removeClearAndBuyerIsolation() throws Exception {
            String me = token(newUser("Student", "Cart Isolation A"));
            String other = token(newUser("Student", "Cart Isolation B"));
            int x = listing(sellerA, "Isolation item X", 30_000);
            int y = listing(sellerA, "Isolation item Y", 40_000);
            for (String t : List.of(me, other)) {
                mvc.perform(put("/api/cart/items/" + x).header("Authorization", bearer(t))).andExpect(status().isCreated());
            }
            mvc.perform(put("/api/cart/items/" + y).header("Authorization", bearer(me))).andExpect(status().isCreated());
            mvc.perform(delete("/api/cart/items/" + x).header("Authorization", bearer(me))).andExpect(status().isNoContent());
            assertThat(getJson("/api/cart", me).get("itemCount").asInt()).isEqualTo(1);
            assertThat(getJson("/api/cart", other).get("itemCount").asInt()).as("the other buyer's cart is untouched").isEqualTo(1);
            mvc.perform(delete("/api/cart").header("Authorization", bearer(me))).andExpect(status().isNoContent());
            assertThat(getJson("/api/cart", me).get("itemCount").asInt()).isZero();
            assertThat(getJson("/api/cart", other).get("itemCount").asInt()).isEqualTo(1);
        }

        @Test
        void listingsThatChangeAfterBeingAddedAreReported() throws Exception {
            String me = token(newUser("Student", "Cart Changes"));
            int gone = listing(sellerA, "Becomes reserved", 60_000);
            int pricey = listing(sellerA, "Price checked", 80_000);
            for (int id : List.of(gone, pricey)) {
                mvc.perform(put("/api/cart/items/" + id).header("Authorization", bearer(me))).andExpect(status().isCreated());
            }
            jdbc.update("UPDATE dbo.Products SET Status = 'Reserved' WHERE ProductId = ?", gone);
            JsonNode cart = getJson("/api/cart", me);
            assertThat(cart.get("unavailable")).hasSize(1);
            assertThat(cart.get("unavailable").get(0).get("productId").asInt()).isEqualTo(gone);
            assertThat(cart.get("unavailable").get(0).get("reason").asText()).isEqualTo("RESERVED");
            assertThat(cart.get("subtotal").asLong()).isEqualTo(80_000);
            // The buyer saw 75,000 earlier: the validation reports the change.
            JsonNode check = readJson(mvc.perform(post("/api/cart/validate").header("Authorization", bearer(me))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"productIds\":[" + pricey + "],\"expectedPrices\":{\"" + pricey + "\":75000}}"))
                    .andExpect(status().isOk()));
            assertThat(check.get("ready").asBoolean()).isFalse();
            assertThat(check.get("items").get(0).get("priceChanged").asBoolean()).isTrue();
            JsonNode whole = readJson(mvc.perform(post("/api/cart/validate").header("Authorization", bearer(me))).andExpect(status().isOk()));
            assertThat(whole.get("ready").asBoolean()).as("a reserved listing is in the cart").isFalse();
        }

        @Test
        void productsCanBeLoadedByIdsForTheCartPage() throws Exception {
            int a = listing(sellerA, "By ids A", 10_000);
            int b = listing(sellerB, "By ids B", 20_000);
            int pending = jdbc.queryForObject("SELECT TOP 1 ProductId FROM dbo.Products WHERE ModerationStatus = 'Pending' AND ProductId <= 50", Integer.class);
            JsonNode items = readJson(mvc.perform(get("/api/products/by-ids?ids=" + b + "," + pending + "," + a + ",999999")).andExpect(status().isOk()));
            assertThat(items).hasSize(2);
            assertThat(items.get(0).get("id").asInt()).isEqualTo(b);
            assertThat(items.get(1).get("id").asInt()).isEqualTo(a);
        }
    }

    // ================================================================== checkout

    @Nested
    class Checkout {

        @Test
        void oneListingOfOneSeller() throws Exception {
            int item = listing(sellerA, "Single checkout lamp", 125_000);
            mvc.perform(put("/api/cart/items/" + item).header("Authorization", bearer(buyerToken))).andExpect(status().isCreated());
            JsonNode orders = checkout(buyerToken, List.of(item), null).get("orders");
            assertThat(orders).hasSize(1);
            JsonNode order = orders.get(0);
            assertThat(order.get("status").asText()).isEqualTo("PENDING");
            assertThat(order.get("role").asText()).isEqualTo("BUYER");
            assertThat(order.get("seller").get("id").asInt()).isEqualTo(sellerA);
            assertThat(order.get("items").get(0).get("unitPrice").asLong()).isEqualTo(125_000);
            assertThat(order.get("items").get(0).get("quantity").asInt()).isEqualTo(1);
            assertThat(order.get("amounts").get("subtotal").asLong()).isEqualTo(125_000);
            assertThat(order.get("amounts").get("shippingFee").asLong()).isEqualTo(FEE);
            assertThat(order.get("amounts").get("total").asLong()).isEqualTo(125_000 + FEE);
            assertThat(order.get("amounts").has("commission")).as("the buyer does not see the seller's commission").isFalse();
            assertThat(order.get("paymentProvider").asText()).isEqualTo("MOMO");
            assertThat(order.get("delivery").get("recipientPhone").asText()).isEqualTo("0912345678");
            assertThat(productStatus(item)).isEqualTo("Reserved");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.CartItems WHERE UserId = ? AND ProductId = ?", Integer.class, buyer, item))
                    .as("ordered listings leave the cart").isZero();
            assertThat(jdbc.queryForObject("SELECT DATEDIFF(hour, CreatedAt, ConfirmBy) FROM dbo.Orders WHERE OrderId = ?", Integer.class,
                    order.get("id").asLong())).isEqualTo(24);
        }

        @Test
        void severalListingsOfOneSellerMakeOneOrder() throws Exception {
            int x = listing(sellerA, "Same seller X", 30_000);
            int y = listing(sellerA, "Same seller Y", 45_000);
            JsonNode orders = checkout(buyerToken, List.of(x, y), null).get("orders");
            assertThat(orders).hasSize(1);
            assertThat(orders.get(0).get("items")).hasSize(2);
            assertThat(orders.get(0).get("amounts").get("subtotal").asLong()).isEqualTo(75_000);
            assertThat(orders.get(0).get("amounts").get("total").asLong()).isEqualTo(75_000 + FEE);
        }

        @Test
        void severalSellersMakeOneOrderEach() throws Exception {
            int a = listing(sellerA, "Multi seller A", 30_000);
            int b1 = listing(sellerB, "Multi seller B1", 40_000);
            int b2 = listing(sellerB, "Multi seller B2", 15_000);
            JsonNode result = checkout(buyerToken, List.of(a, b1, b2), null);
            JsonNode orders = result.get("orders");
            assertThat(orders).hasSize(2);
            assertThat(result.get("subtotal").asLong()).isEqualTo(85_000);
            assertThat(result.get("shippingFee").asLong()).isEqualTo(2 * FEE);
            assertThat(result.get("total").asLong()).isEqualTo(85_000 + 2 * FEE);
            assertThat(result.get("shippingFeePolicy").get("included").asBoolean()).isTrue();
            assertThat(result.get("shippingFeePolicy").get("method").asText()).isEqualTo("SIMULATED_DISTANCE");
            Map<Integer, JsonNode> bySeller = new HashMap<>();
            orders.forEach(o -> bySeller.put(o.get("seller").get("id").asInt(), o));
            assertThat(bySeller.get(sellerA).get("items")).hasSize(1);
            assertThat(bySeller.get(sellerB).get("items")).hasSize(2);
            assertThat(bySeller.get(sellerB).get("amounts").get("subtotal").asLong()).isEqualTo(55_000);
            // Each order carries its own delivery fee.
            assertThat(bySeller.get(sellerA).get("amounts").get("shippingFee").asLong()).isEqualTo(FEE);
            assertThat(bySeller.get(sellerB).get("amounts").get("shippingFee").asLong()).isEqualTo(FEE);
        }

        @Test
        void oneUnavailableListingCancelsTheWholeCheckout() throws Exception {
            int ok = listing(sellerA, "Rollback OK listing", 30_000);
            int taken = listing(sellerB, "Rollback taken listing", 40_000);
            jdbc.update("UPDATE dbo.Products SET Status = 'Reserved' WHERE ProductId = ?", taken);
            long before = ordersOf(buyer);
            mvc.perform(post("/api/checkout").header("Authorization", bearer(buyerToken)).contentType(MediaType.APPLICATION_JSON)
                            .content(checkoutBody(buyerToken, List.of(ok, taken), null)))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_UNAVAILABLE"))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("productIds[" + taken + "]"))
                    .andExpect(jsonPath("$.fieldErrors[0].message").value("RESERVED"));
            assertThat(ordersOf(buyer)).isEqualTo(before);
            assertThat(productStatus(ok)).isEqualTo("Available");
        }

        @Test
        void theProcedureItselfIsAllOrNothingAcrossSellers() {
            // Bypasses the Java pre-checks: the database must roll back the orders of the other seller too.
            int ok = listing(sellerA, "DB rollback OK", 30_000);
            int taken = listing(sellerB, "DB rollback taken", 40_000);
            jdbc.update("UPDATE dbo.Products SET Status = 'Sold' WHERE ProductId = ?", taken);
            long before = ordersOf(buyer);
            List<com.unimarket.service.shipping.ShippingQuoteService.ConfirmedShipping> shipping = List.of(
                    new com.unimarket.service.shipping.ShippingQuoteService.ConfirmedShipping(sellerA, CARRIER, pickupZone, distanceTenths, FEE, "SIM-2026-11"),
                    new com.unimarket.service.shipping.ShippingQuoteService.ConfirmedShipping(sellerB, CARRIER, pickupZone, distanceTenths, FEE, "SIM-2026-11"));
            assertThatThrownBy(() -> procedures.checkoutWithShipping(buyer, List.of(ok, taken), deliveryZone, shipping, "Buyer", "0912345678", "Dorm A", null))
                    .isInstanceOf(DataAccessException.class)
                    .satisfies(ex -> assertThat(com.unimarket.service.order.SqlErrors.numberOf(ex)).isEqualTo(51021));
            assertThat(ordersOf(buyer)).isEqualTo(before);
            assertThat(productStatus(ok)).isEqualTo("Available");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderItems WHERE ProductId = ?", Integer.class, ok)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderShippingQuotes q JOIN dbo.Orders o ON o.OrderId = q.OrderId "
                    + "WHERE o.BuyerId = ? AND o.OrderId NOT IN (SELECT OrderId FROM dbo.OrderItems)", Integer.class, buyer)).isZero();
        }

        @Test
        void invalidRequestsAreRejected() throws Exception {
            int item = listing(sellerA, "Validation item", 30_000);
            expectCheckout(buyerToken, "{\"productIds\":[" + item + "," + item + "],\"recipientName\":\"Buyer\",\"recipientPhone\":\"0912345678\",\"deliveryAddress\":\"Dorm A, room 1\"}",
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
            expectCheckout(buyerToken, "{\"productIds\":[" + item + "],\"recipientName\":\"Buyer\",\"recipientPhone\":\"12345\",\"deliveryAddress\":\"Dorm A, room 1\"}",
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
            expectCheckout(buyerToken, "{\"productIds\":[],\"recipientName\":\"Buyer\",\"recipientPhone\":\"0912345678\",\"deliveryAddress\":\"Dorm A, room 1\"}",
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
            expectCheckout(buyerToken, "{\"productIds\":[" + item + "],\"recipientName\":\"Buyer\",\"recipientPhone\":\"0912345678\",\"deliveryAddress\":\"Dorm A, room 1\",\"paymentProvider\":\"CARD\"}",
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
            mvc.perform(post("/api/checkout").contentType(MediaType.APPLICATION_JSON).content(checkoutBody(buyerToken, List.of(item), null)))
                    .andExpect(status().isUnauthorized());
            assertThat(productStatus(item)).isEqualTo("Available");
        }

        @Test
        void buyingYourOwnListingIsRefused() throws Exception {
            int own = listing(buyer, "Own listing checkout", 30_000);
            expectCheckout(buyerToken, checkoutBody(buyerToken, List.of(own), null), HttpStatus.CONFLICT, "OWN_LISTING");
        }

        @Test
        void aChangedPriceStopsTheCheckout() throws Exception {
            int item = listing(sellerA, "Price changed item", 90_000);
            expectCheckout(buyerToken, checkoutBody(buyerToken, List.of(item), Map.of(item, 85_000L)), HttpStatus.CONFLICT, "PRICE_CHANGED");
            assertThat(productStatus(item)).isEqualTo("Available");
            assertThat(checkout(buyerToken, List.of(item), Map.of(item, 90_000L)).get("orders")).hasSize(1);
        }

        @Test
        void twoBuyersRacingForOneListing() throws Exception {
            int item = listing(sellerA, "Race item", 50_000);
            String other = token(newUser("Student", "Racing buyer"));
            String mine = checkoutBody(buyerToken, List.of(item), null);
            String theirs = checkoutBody(other, List.of(item), null);
            List<ResponseEntity<String>> results = race(() -> restCheckout(buyerToken, mine), () -> restCheckout(other, theirs));
            assertThat(results.stream().filter(r -> r.getStatusCode() == HttpStatus.CREATED)).hasSize(1);
            assertThat(results.stream().filter(r -> r.getStatusCode() == HttpStatus.CONFLICT)).hasSize(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ActiveOrderItems WHERE ProductId = ?", Integer.class, item)).isEqualTo(1);
            assertThat(productStatus(item)).isEqualTo("Reserved");
        }

        @Test
        void checkoutRacingWithTheSellerEditingTheListing() throws Exception {
            int item = listing(sellerA, "Edit race item", 50_000);
            String edit = "{\"title\":\"Edit race item (edited)\",\"description\":\"A clean, well kept item from a student.\",\"price\":1000,"
                    + "\"originalPrice\":null,\"condition\":\"USED\",\"categoryId\":1,\"campusId\":null}";
            String order = checkoutBody(buyerToken, List.of(item), null);
            List<ResponseEntity<String>> results = race(
                    () -> restCheckout(buyerToken, order),
                    () -> rest.exchange("/api/products/" + item, HttpMethod.PUT, new HttpEntity<>(edit, jsonHeaders(sellerAToken)), String.class));
            boolean ordered = results.get(0).getStatusCode() == HttpStatus.CREATED;
            boolean edited = results.get(1).getStatusCode() == HttpStatus.OK;
            assertThat(ordered ^ edited).as("exactly one of checkout and edit wins: " + results).isTrue();
            if (ordered) {
                assertThat(results.get(1).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                assertThat(productStatus(item)).isEqualTo("Reserved");
                assertThat(jdbc.queryForObject("SELECT UnitPrice FROM dbo.OrderItems WHERE ProductId = ?", BigDecimal.class, item)).isEqualByComparingTo("50000");
            } else {
                assertThat(results.get(0).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                assertThat(jdbc.queryForObject("SELECT ModerationStatus FROM dbo.Products WHERE ProductId = ?", String.class, item)).isEqualTo("Pending");
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderItems WHERE ProductId = ?", Integer.class, item)).isZero();
            }
        }

        @Test
        void repeatedSubmissionsCreateOnlyOneOrder() throws Exception {
            int item = listing(sellerA, "Double submit item", 50_000);
            String body = checkoutBody(buyerToken, List.of(item), null);
            List<ResponseEntity<String>> concurrent = race(() -> restCheckout(buyerToken, body), () -> restCheckout(buyerToken, body));
            assertThat(concurrent.stream().filter(r -> r.getStatusCode() == HttpStatus.CREATED)).hasSize(1);
            long orderId = jdbc.queryForObject("SELECT OrderId FROM dbo.OrderItems WHERE ProductId = ?", Long.class, item);
            // A retry after a lost response is refused (409), never a second order, and points to the existing order.
            mvc.perform(post("/api/checkout").header("Authorization", bearer(buyerToken)).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LISTING_UNAVAILABLE"))
                    .andExpect(jsonPath("$.fieldErrors[0].message").value("ALREADY_IN_YOUR_ORDER"))
                    .andExpect(jsonPath("$.fieldErrors[1].field").value("existingOrderIds"))
                    .andExpect(jsonPath("$.fieldErrors[1].message").value(String.valueOf(orderId)));
            // Another buyer only learns that it is reserved.
            mvc.perform(post("/api/checkout").header("Authorization", bearer(strangerToken)).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.fieldErrors[0].message").value("RESERVED"))
                    .andExpect(jsonPath("$.fieldErrors.length()").value(1));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderItems WHERE ProductId = ?", Integer.class, item)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vw_ActiveOrderItems WHERE ProductId = ?", Integer.class, item)).isEqualTo(1);
        }
    }

    // ================================================================== orders

    @Nested
    class Orders {

        @Test
        void historyForBuyerAndSeller() throws Exception {
            long id = placeOne(sellerB, "History item", 30_000);
            assertThat(ids(getJson("/api/orders?role=buyer&size=50", buyerToken))).contains(id);
            assertThat(ids(getJson("/api/orders?role=seller&size=50", sellerBToken))).contains(id);
            assertThat(ids(getJson("/api/orders?role=seller&size=50", buyerToken))).doesNotContain(id);
            assertThat(ids(getJson("/api/orders?role=buyer&size=50", sellerBToken))).doesNotContain(id);
            assertThat(ids(getJson("/api/orders?role=buyer&size=50&status=PENDING", buyerToken))).contains(id);
            assertThat(ids(getJson("/api/orders?role=buyer&size=50&status=COMPLETED", buyerToken))).doesNotContain(id);
            mvc.perform(get("/api/orders?role=both").header("Authorization", bearer(buyerToken))).andExpect(status().isBadRequest());
            mvc.perform(get("/api/orders?status=SHIPPED").header("Authorization", bearer(buyerToken))).andExpect(status().isBadRequest());
            JsonNode counts = getJson("/api/orders/action-counts", sellerBToken);
            assertThat(counts.get("seller").asLong()).isPositive();
            assertThat(ids(readJson(mvc.perform(get("/api/orders/by-ids?ids=" + id).header("Authorization", bearer(strangerToken))))))
                    .as("by-ids leaves out orders of others").isEmpty();
        }

        @Test
        void onlyParticipantsAndAdminsCanSeeAnOrder() throws Exception {
            long id = placeOne(sellerA, "Privacy item", 30_000);
            mvc.perform(get("/api/orders/" + id).header("Authorization", bearer(strangerToken))).andExpect(status().isNotFound());
            mvc.perform(post("/api/orders/" + id + "/confirm").header("Authorization", bearer(strangerToken))).andExpect(status().isNotFound());
            mvc.perform(post("/api/orders/" + id + "/cancel").header("Authorization", bearer(strangerToken))).andExpect(status().isNotFound());
            mvc.perform(get("/api/orders/" + id)).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/orders/" + id).header("Authorization", bearer(sellerAToken))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("SELLER"))
                    .andExpect(jsonPath("$.amounts.commission").exists())
                    .andExpect(jsonPath("$.delivery").doesNotExist())
                    .andExpect(jsonPath("$.payments").doesNotExist());
            mvc.perform(get("/api/orders/" + id).header("Authorization", bearer(adminToken))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("ADMIN")).andExpect(jsonPath("$.actions.length()").value(0));
            // Each side can only do its own steps.
            mvc.perform(post("/api/orders/" + id + "/confirm").header("Authorization", bearer(buyerToken))).andExpect(status().isForbidden());
            mvc.perform(post("/api/orders/" + id + "/ship").header("Authorization", bearer(buyerToken))).andExpect(status().isForbidden());
            mvc.perform(post("/api/orders/" + id + "/confirm-receipt").header("Authorization", bearer(sellerAToken))).andExpect(status().isForbidden());
            mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(sellerAToken))).andExpect(status().isForbidden());
            mvc.perform(post("/api/orders/" + id + "/confirm").header("Authorization", bearer(adminToken))).andExpect(status().isForbidden());
            assertThat(orderStatus(id)).isEqualTo("Pending");
        }

        @Test
        void sellerSeesTheRecipientOnlyBetweenVerifiedPaymentAndDelivery() throws Exception {
            long id = placeOne(sellerA, "Recipient privacy", 30_000);
            assertRecipientVisibility(id, false);                                        // PENDING
            act(sellerAToken, id, "confirm").andExpect(status().isOk());
            assertRecipientVisibility(id, false);                                        // AWAITING_PAYMENT
            payWithSimulator(id, false);
            assertRecipientVisibility(id, false);                                        // failed payment: still unpaid
            payWithSimulator(id, true);
            assertRecipientVisibility(id, true);                                         // PAID
            act(sellerAToken, id, "ship").andExpect(status().isOk());
            assertRecipientVisibility(id, true);                                         // DELIVERING
            act(buyerToken, id, "confirm-receipt").andExpect(status().isOk());
            assertRecipientVisibility(id, false);                                        // COMPLETED
            // The buyer and admins always see it; nobody else sees the order at all.
            mvc.perform(get("/api/orders/" + id).header("Authorization", bearer(buyerToken))).andExpect(jsonPath("$.delivery.recipientPhone").value("0912345678"));
            mvc.perform(get("/api/orders/" + id).header("Authorization", bearer(adminToken))).andExpect(jsonPath("$.delivery.address").exists());
            mvc.perform(get("/api/orders/" + id).header("Authorization", bearer(strangerToken))).andExpect(status().isNotFound());
        }

        /** Seller's view of the recipient in the order page AND in the "My sales" list. */
        private void assertRecipientVisibility(long id, boolean visible) throws Exception {
            JsonNode detail = getJson("/api/orders/" + id, sellerAToken);
            JsonNode listed = null;
            for (JsonNode o : getJson("/api/orders?role=seller&size=50", sellerAToken).get("items")) {
                if (o.get("id").asLong() == id) {
                    listed = o;
                }
            }
            assertThat(listed).isNotNull();
            for (JsonNode view : List.of(detail, listed)) {
                assertThat(view.has("delivery")).as(view.get("status").asText()).isEqualTo(visible);
                assertThat(view.toString().contains("0912345678")).as("phone in " + view.get("status").asText()).isEqualTo(visible);
                assertThat(view.toString().contains("Dormitory A, room 305")).as("address in " + view.get("status").asText()).isEqualTo(visible);
            }
        }

        @Test
        void sellerConfirmsAndThePaymentWindowStarts() throws Exception {
            long id = placeOne(sellerA, "Confirm item", 30_000);
            JsonNode order = readJson(act(sellerAToken, id, "confirm").andExpect(status().isOk()));
            assertThat(order.get("status").asText()).isEqualTo("AWAITING_PAYMENT");
            assertThat(jdbc.queryForObject("SELECT DATEDIFF(minute, ConfirmedAt, PaymentDueAt) FROM dbo.Orders WHERE OrderId = ?", Integer.class, id))
                    .isEqualTo(24 * 60);
            act(sellerAToken, id, "confirm").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_STATE_CONFLICT"));
            assertThat(getJson("/api/orders/" + id, buyerToken).get("actions").toString()).contains("PAY").contains("CANCEL");
        }

        @Test
        void sellerDeclinesAndEveryListingIsReleased() throws Exception {
            int x = listing(sellerA, "Decline X", 30_000);
            int y = listing(sellerA, "Decline Y", 30_000);
            long id = checkout(buyerToken, List.of(x, y), null).get("orders").get(0).get("id").asLong();
            JsonNode order = readJson(mvc.perform(post("/api/orders/" + id + "/cancel").header("Authorization", bearer(sellerAToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Item is broken\"}")).andExpect(status().isOk()));
            assertThat(order.get("status").asText()).isEqualTo("CANCELLED");
            assertThat(order.get("cancellationReason").asText()).isEqualTo("Item is broken");
            assertThat(order.has("delivery")).as("a cancelled order never shows the recipient to the seller").isFalse();
            assertThat(productStatus(x)).isEqualTo("Available");
            assertThat(productStatus(y)).isEqualTo("Available");
            act(sellerAToken, id, "confirm").andExpect(status().isConflict());
        }

        @Test
        void buyerCancelsBeforePaymentButNotAfter() throws Exception {
            long pending = placeOne(sellerA, "Cancel pending", 30_000);
            act(buyerToken, pending, "cancel").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
            long awaiting = placeOne(sellerA, "Cancel awaiting", 30_000);
            act(sellerAToken, awaiting, "confirm").andExpect(status().isOk());
            act(buyerToken, awaiting, "cancel").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
            long paid = toPaid(sellerA, "Cancel paid", 30_000);
            act(buyerToken, paid, "cancel").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_STATE_CONFLICT"));
            assertThat(orderStatus(paid)).isEqualTo("Paid");
        }

        @Test
        void stepsOutOfOrderAreRejected() throws Exception {
            long id = placeOne(sellerA, "Out of order", 30_000);
            act(sellerAToken, id, "ship").andExpect(status().isConflict());
            act(buyerToken, id, "confirm-receipt").andExpect(status().isConflict());
            mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken)))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_STATE_CONFLICT"));
            long paid = toPaid(sellerA, "Out of order paid", 30_000);
            act(buyerToken, paid, "confirm-receipt").andExpect(status().isConflict());
            act(sellerAToken, paid, "confirm").andExpect(status().isConflict());
        }

        @Test
        void itemsKeepTheirCheckoutSnapshot() throws Exception {
            int item = listing(sellerA, "Snapshot title", 77_000);
            long id = checkout(buyerToken, List.of(item), null).get("orders").get(0).get("id").asLong();
            jdbc.update("UPDATE dbo.Products SET Title = N'Renamed later', Price = 1000 WHERE ProductId = ?", item);
            JsonNode order = getJson("/api/orders/" + id, buyerToken);
            assertThat(order.get("items").get(0).get("title").asText()).isEqualTo("Snapshot title");
            assertThat(order.get("items").get(0).get("unitPrice").asLong()).isEqualTo(77_000);
            assertThat(order.get("amounts").get("subtotal").asLong()).isEqualTo(77_000);
        }

        @Test
        void historyRecordsEveryStepAndWho() throws Exception {
            long id = toCompleted(sellerB, "History flow", 40_000);
            JsonNode history = getJson("/api/orders/" + id, buyerToken).get("history");
            List<String> steps = new ArrayList<>();
            history.forEach(h -> steps.add(h.get("status").asText() + ":" + h.get("changedBy").asText()));
            assertThat(steps).containsExactly("PENDING:BUYER", "AWAITING_PAYMENT:SELLER", "PAID:SYSTEM", "DELIVERING:SELLER", "COMPLETED:BUYER");
        }
    }

    // ================================================================== money

    @Nested
    class Money {

        @Test
        void commissionIsThreePercentOfTheSubtotalOnlyAndRoundedHalfUp() throws Exception {
            for (long price : List.of(333_333L, 1_150L, 65_000L)) {
                long id = placeOne(sellerA, "Money " + price, price);
                JsonNode amounts = getJson("/api/orders/" + id, sellerAToken).get("amounts");
                long commission = BigDecimal.valueOf(price).multiply(new BigDecimal("0.03")).setScale(0, RoundingMode.HALF_UP).longValueExact();
                assertThat(amounts.get("commissionRate").decimalValue()).isEqualByComparingTo("0.03");
                assertThat(amounts.get("subtotal").asLong()).isEqualTo(price);
                assertThat(amounts.get("shippingFee").asLong()).isEqualTo(FEE);
                assertThat(amounts.get("total").asLong()).as("buyer pays merchandise + delivery").isEqualTo(price + FEE);
                assertThat(amounts.get("commission").asLong()).as("no commission on the delivery fee").isEqualTo(commission);
                assertThat(amounts.get("sellerProceeds").asLong()).isEqualTo(price - commission);
                assertThat(amounts.get("sellerPayout").asLong()).as("delivery fee goes to the seller").isEqualTo(price - commission + FEE);
            }
            // The approved examples: 333,333 → 10,000 (V002 F16) and 1,150 → 34.5 → 35 (half away from zero).
            assertThat(BigDecimal.valueOf(1_150).multiply(new BigDecimal("0.03")).setScale(0, RoundingMode.HALF_UP).longValue()).isEqualTo(35);
        }

        @Test
        void completionCreatesOneSettlementWithTheOrdersAmounts() throws Exception {
            long id = toCompleted(sellerB, "Settlement item", 200_000);
            JsonNode settlement = getJson("/api/orders/" + id, sellerBToken).get("settlement");
            assertThat(settlement.get("status").asText()).isEqualTo("PENDING");
            assertThat(settlement.get("merchandiseSubtotal").asLong()).isEqualTo(200_000);
            assertThat(settlement.get("commission").asLong()).isEqualTo(6_000);
            assertThat(settlement.get("shippingFee").asLong()).isEqualTo(FEE);
            assertThat(settlement.get("amount").asLong()).isEqualTo(200_000 - 6_000 + FEE);
            assertThat(settlement.get("sandbox").asBoolean()).isTrue();
            assertThat(getJson("/api/orders/" + id, buyerToken).has("settlement")).as("the buyer does not see the payout").isFalse();
            act(buyerToken, id, "confirm-receipt").andExpect(status().isConflict());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.SellerSettlements WHERE OrderId = ?", Integer.class, id)).isEqualTo(1);
        }

        @Test
        void historicalAmountsDoNotChangeWhenListingsChange() throws Exception {
            int item = listing(sellerA, "Historic amounts", 120_000);
            long id = checkout(buyerToken, List.of(item), null).get("orders").get(0).get("id").asLong();
            act(sellerAToken, id, "confirm").andExpect(status().isOk());
            payWithSimulator(id, true);
            act(sellerAToken, id, "ship").andExpect(status().isOk());
            act(buyerToken, id, "confirm-receipt").andExpect(status().isOk());
            jdbc.update("UPDATE dbo.Products SET Price = 5000 WHERE ProductId = ?", item);
            JsonNode amounts = getJson("/api/orders/" + id, sellerAToken).get("amounts");
            assertThat(amounts.get("subtotal").asLong()).isEqualTo(120_000);
            assertThat(amounts.get("commission").asLong()).isEqualTo(3_600);
            assertThat(amounts.get("sellerPayout").asLong()).isEqualTo(120_000 - 3_600 + FEE);
        }
    }

    // ================================================================== payments

    @Nested
    class Payments {

        @Test
        void startingAPaymentDoesNotMarkThePaidAndCanBeResumed() throws Exception {
            long id = confirmedOrder(sellerA, "Payment start", 50_000);
            JsonNode attempt = readJson(mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"ZALOPAY\"}")).andExpect(status().isCreated()));
            assertThat(attempt.get("status").asText()).isEqualTo("PENDING");
            assertThat(attempt.get("sandbox").asBoolean()).isTrue();
            assertThat(attempt.get("amount").asLong()).isEqualTo(50_000 + FEE);
            assertThat(attempt.get("provider").asText()).isEqualTo("ZALOPAY");
            assertThat(attempt.get("simulatorUrl").asText()).endsWith("/complete");
            assertThat(attempt.has("requestKey")).isFalse();
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
            JsonNode again = readJson(mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken)))
                    .andExpect(status().isOk()));
            assertThat(again.get("paymentId").asLong()).isEqualTo(attempt.get("paymentId").asLong());
            assertThat(again.get("resumed").asBoolean()).isTrue();
            // While the attempt is in progress, the order cannot be cancelled (V002 51019).
            act(buyerToken, id, "cancel").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_IN_PROGRESS"));
        }

        @Test
        void aVerifiedSimulatedPaymentMarksTheOrderPaid() throws Exception {
            long id = confirmedOrder(sellerA, "Verified payment", 50_000);
            JsonNode order = payWithSimulator(id, true);
            assertThat(order.get("status").asText()).isEqualTo("PAID");
            assertThat(order.get("payments").get(0).get("status").asText()).isEqualTo("SUCCEEDED");
            assertThat(order.get("payments").get(0).get("sandbox").asBoolean()).isTrue();
            String providerReference = jdbc.queryForObject("SELECT ProviderReference FROM dbo.Payments WHERE OrderId = ? AND Status = 'Succeeded'", String.class, id);
            assertThat(providerReference).as("simulated payments are labelled").startsWith("SIM-");
            // Payment references are never returned (the V003 shipping block may contain the formula "SIM-2026-11").
            assertThat(order.toString()).doesNotContain(providerReference).doesNotContain("UMK-");
        }

        @Test
        void aFailedSimulatedPaymentLeavesTheOrderUnpaidAndAllowsANewAttempt() throws Exception {
            long id = confirmedOrder(sellerA, "Failed payment", 50_000);
            JsonNode order = payWithSimulator(id, false);
            assertThat(order.get("status").asText()).isEqualTo("AWAITING_PAYMENT");
            assertThat(order.get("payments").get(0).get("status").asText()).isEqualTo("FAILED");
            mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken))).andExpect(status().isCreated());
        }

        @Test
        void notificationsMustBeSignedAndMatchTheAttempt() throws Exception {
            long id = confirmedOrder(sellerA, "Signed callback", 50_000);
            startPayment(id);
            String key = requestKey(id);
            PaymentResultService.PaymentNotification good = new PaymentResultService.PaymentNotification(key, "SIM-test-" + UUID.randomUUID(), 50_000 + FEE, true, "MOMO");
            // No signature / wrong signature / signature of other content.
            assertThat(callback(good, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(callback(good, "00".repeat(32)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            PaymentResultService.PaymentNotification cheaper = new PaymentResultService.PaymentNotification(key, good.providerReference(), 1_000, true, "MOMO");
            assertThat(callback(cheaper, simulator.sign(good)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            // Correctly signed but wrong amount / unknown attempt / wrong provider.
            assertThat(callback(cheaper, simulator.sign(cheaper)).getBody()).contains("PAYMENT_MISMATCH");
            PaymentResultService.PaymentNotification unknown = new PaymentResultService.PaymentNotification("UMK-unknown-" + UUID.randomUUID(), "SIM-x", 50_000 + FEE, true, "MOMO");
            assertThat(callback(unknown, simulator.sign(unknown)).getBody()).contains("PAYMENT_MISMATCH");
            PaymentResultService.PaymentNotification otherProvider = new PaymentResultService.PaymentNotification(key, "SIM-y-" + UUID.randomUUID(), 50_000 + FEE, true, "ZALOPAY");
            assertThat(callback(otherProvider, simulator.sign(otherProvider)).getBody()).contains("PAYMENT_MISMATCH");
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
            // The genuine notification is accepted once; an identical repeat is ignored; a conflicting one is refused.
            ResponseEntity<String> first = callback(good, simulator.sign(good));
            assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(first.getBody()).contains("RECORDED").contains("PAID");
            ResponseEntity<String> repeat = callback(good, simulator.sign(good));
            assertThat(repeat.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(repeat.getBody()).contains("DUPLICATE_IGNORED");
            PaymentResultService.PaymentNotification conflicting = new PaymentResultService.PaymentNotification(key, "SIM-other-" + UUID.randomUUID(), 50_000 + FEE, false, "MOMO");
            ResponseEntity<String> conflict = callback(conflicting, simulator.sign(conflicting));
            assertThat(conflict.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(conflict.getBody()).contains("PAYMENT_CONFLICT");
            assertThat(orderStatus(id)).isEqualTo("Paid");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Payments WHERE OrderId = ? AND Status = 'Succeeded'", Integer.class, id)).isEqualTo(1);
        }

        @Test
        void theSimulatorNeverTouchesANonSandboxAttempt() throws Exception {
            long id = confirmedOrder(sellerA, "Real attempt", 50_000);
            startPayment(id);
            // Stands for a future real-provider attempt (test copy only): the simulator must not settle it.
            jdbc.update("UPDATE dbo.Payments SET IsSandbox = 0 WHERE OrderId = ?", id);
            long paymentId = jdbc.queryForObject("SELECT PaymentId FROM dbo.Payments WHERE OrderId = ?", Long.class, id);
            mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").header("Authorization", bearer(buyerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isNotFound());
            PaymentResultService.PaymentNotification signed = new PaymentResultService.PaymentNotification(requestKey(id), "SIM-real-" + UUID.randomUUID(), 50_000 + FEE, true, "MOMO");
            assertThat(callback(signed, simulator.sign(signed)).getBody()).contains("PAYMENT_MISMATCH");
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
            assertThat(getJson("/api/orders/" + id, buyerToken).get("payments").get(0).get("sandbox").asBoolean()).isFalse();
        }

        @Test
        void noOneCanMarkAnOrderPaidDirectly() throws Exception {
            long id = confirmedOrder(sellerA, "No mark paid", 50_000);
            for (String path : List.of("mark-paid", "pay", "paid")) {
                mvc.perform(post("/api/orders/" + id + "/" + path).header("Authorization", bearer(buyerToken))).andExpect(status().isNotFound());
            }
            mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken))).andExpect(status().isCreated());
            long paymentId = jdbc.queryForObject("SELECT PaymentId FROM dbo.Payments WHERE OrderId = ?", Long.class, id);
            // Another student cannot finish someone else's simulated payment.
            mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").header("Authorization", bearer(strangerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isNotFound());
            mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isUnauthorized());
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
        }

        @Test
        void aPaymentStartedBeforeTheDeadlineIsAcceptedWithinTheGraceWindow() throws Exception {
            long id = confirmedOrder(sellerA, "Grace window", 50_000);
            startPayment(id);
            moveOrderBack(id, 24 * 60 + 10);       // payment deadline was 10 minutes ago
            movePaymentBack(id, 24 * 60 + 20);     // the attempt started 20 minutes ago, before the deadline
            assertThat(expiry.expireOverdueOrders()).as("an attempt in flight within the grace window is waited for")
                    .noneMatch(e -> e.orderId() == id);
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
            assertThat(payWithSimulator(id, true).get("status").asText()).isEqualTo("PAID");
        }

        @Test
        void aPaymentStartedAfterTheDeadlineIsRejected() throws Exception {
            long id = confirmedOrder(sellerA, "Started late", 50_000);
            startPayment(id);
            moveOrderBack(id, 24 * 60 + 10);       // deadline 10 minutes ago, attempt started now (after it)
            long paymentId = jdbc.queryForObject("SELECT PaymentId FROM dbo.Payments WHERE OrderId = ?", Long.class, id);
            mvc.perform(post("/api/dev/payment-simulator/payments/" + paymentId + "/complete").header("Authorization", bearer(buyerToken))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"SUCCESS\"}"))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_TOO_LATE"));
            assertThat(orderStatus(id)).isEqualTo("AwaitingPayment");
        }

        @Test
        void aPaymentAfterTheGraceWindowIsRejectedAndTheOrderExpires() throws Exception {
            int item = listing(sellerA, "After grace", 50_000);
            long id = checkout(buyerToken, List.of(item), null).get("orders").get(0).get("id").asLong();
            act(sellerAToken, id, "confirm").andExpect(status().isOk());
            startPayment(id);
            moveOrderBack(id, 24 * 60 + 60);       // deadline 60 minutes ago: grace (30 min) is over
            movePaymentBack(id, 24 * 60 + 70);     // started before the deadline
            String key = requestKey(id);
            PaymentResultService.PaymentNotification success = new PaymentResultService.PaymentNotification(key, "SIM-late-" + UUID.randomUUID(), 50_000 + FEE, true, "MOMO");
            assertThat(callback(success, simulator.sign(success)).getBody()).contains("PAYMENT_TOO_LATE");
            assertThat(expiry.expireOverdueOrders()).anyMatch(e -> e.orderId() == id);
            assertThat(orderStatus(id)).isEqualTo("Cancelled");
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.Payments WHERE OrderId = ?", String.class, id)).isEqualTo("Expired");
            assertThat(productStatus(item)).isEqualTo("Available");
            assertThat(callback(success, simulator.sign(success)).getBody()).as("a success for an expired attempt is refused").contains("PAYMENT_TOO_LATE");
        }

        @Test
        void noNewPaymentAfterTheDeadline() throws Exception {
            long id = confirmedOrder(sellerA, "Start after deadline", 50_000);
            moveOrderBack(id, 24 * 60 + 1);
            mvc.perform(post("/api/orders/" + id + "/payments").header("Authorization", bearer(buyerToken)))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_DEADLINE_PASSED"));
        }
    }

    // ================================================================== expiry

    @Nested
    class Expiry {

        @Test
        void unconfirmedOrdersExpireAfter24HoursAndReleaseTheirListings() throws Exception {
            int x = listing(sellerA, "Seller too slow X", 30_000);
            int y = listing(sellerA, "Seller too slow Y", 30_000);
            long id = checkout(buyerToken, List.of(x, y), null).get("orders").get(0).get("id").asLong();
            jdbc.update("UPDATE dbo.Orders SET CreatedAt = DATEADD(hour, -25, CreatedAt), ConfirmBy = DATEADD(hour, -25, ConfirmBy) WHERE OrderId = ?", id);
            act(sellerAToken, id, "confirm").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_DEADLINE_PASSED"));
            assertThat(expiry.expireOverdueOrders()).anyMatch(e -> e.orderId() == id && e.previousStatus().equals("Pending"));
            JsonNode order = getJson("/api/orders/" + id, buyerToken);
            assertThat(order.get("status").asText()).isEqualTo("CANCELLED");
            assertThat(order.get("cancellationReason").asText()).isEqualTo("Confirmation deadline exceeded");
            assertThat(order.get("history").get(1).get("changedBy").asText()).isEqualTo("SYSTEM");
            assertThat(productStatus(x)).isEqualTo("Available");
            assertThat(productStatus(y)).isEqualTo("Available");
        }

        @Test
        void unpaidOrdersExpire24HoursAfterTheSellerConfirmed() throws Exception {
            int item = listing(sellerA, "Buyer too slow", 30_000);
            long id = checkout(buyerToken, List.of(item), null).get("orders").get(0).get("id").asLong();
            // The seller confirms at hour 23 of their window: the buyer still gets a full 24 hours from now.
            jdbc.update("UPDATE dbo.Orders SET CreatedAt = DATEADD(hour, -23, CreatedAt), ConfirmBy = DATEADD(hour, -23, ConfirmBy) WHERE OrderId = ?", id);
            act(sellerAToken, id, "confirm").andExpect(status().isOk());
            assertThat(expiry.expireOverdueOrders()).noneMatch(e -> e.orderId() == id);
            moveOrderBack(id, 24 * 60 + 1);
            assertThat(expiry.expireOverdueOrders()).anyMatch(e -> e.orderId() == id && e.previousStatus().equals("AwaitingPayment"));
            assertThat(getJson("/api/orders/" + id, buyerToken).get("cancellationReason").asText()).isEqualTo("Payment deadline exceeded");
            assertThat(productStatus(item)).isEqualTo("Available");
        }

        @Test
        void repeatedRunsAreSafeAndPaidOrdersAreNeverExpired() throws Exception {
            long overdue = placeOne(sellerA, "Repeat run", 30_000);
            jdbc.update("UPDATE dbo.Orders SET CreatedAt = DATEADD(hour, -25, CreatedAt), ConfirmBy = DATEADD(hour, -25, ConfirmBy) WHERE OrderId = ?", overdue);
            long paid = toPaid(sellerA, "Paid stays", 30_000);
            moveOrderBack(paid, 48 * 60);
            assertThat(expiry.expireOverdueOrders()).anyMatch(e -> e.orderId() == overdue).noneMatch(e -> e.orderId() == paid);
            int history = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE OrderId = ?", Integer.class, overdue);
            assertThat(expiry.expireOverdueOrders()).noneMatch(e -> e.orderId() == overdue);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE OrderId = ?", Integer.class, overdue)).isEqualTo(history);
            assertThat(orderStatus(paid)).isEqualTo("Paid");
        }

        @Test
        void afterARestartOneRunCatchesUpEverythingOverdue() throws Exception {
            // Deadlines live in the database: orders that became overdue while the job was off expire at the first run.
            long first = placeOne(sellerA, "Catch up 1", 30_000);
            long second = placeOne(sellerB, "Catch up 2", 30_000);
            for (long id : List.of(first, second)) {
                jdbc.update("UPDATE dbo.Orders SET CreatedAt = DATEADD(day, -3, CreatedAt), ConfirmBy = DATEADD(day, -3, ConfirmBy) WHERE OrderId = ?", id);
            }
            List<OrderProcedures.Expired> expired = expiry.expireOverdueOrders();
            assertThat(expired).anyMatch(e -> e.orderId() == first).anyMatch(e -> e.orderId() == second);
            assertThat(context.getBeanNamesForType(com.unimarket.config.OrderExpiryScheduler.class))
                    .as("the scheduler is switched off by configuration in tests").isEmpty();
        }
    }

    // ================================================================== delivery, completion, disputes

    @Nested
    class Delivery {

        @Test
        void sellerShipsAndBuyerConfirmsReceipt() throws Exception {
            int item = listing(sellerB, "Delivered item", 60_000);
            long id = checkout(buyerToken, List.of(item), null).get("orders").get(0).get("id").asLong();
            act(sellerBToken, id, "confirm").andExpect(status().isOk());
            payWithSimulator(id, true);
            JsonNode shipped = readJson(mvc.perform(post("/api/orders/" + id + "/ship").header("Authorization", bearer(sellerBToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"carrier\":\"GrabExpress\",\"trackingNumber\":\"GE123\"}")).andExpect(status().isOk()));
            assertThat(shipped.get("status").asText()).isEqualTo("DELIVERING");
            assertThat(shipped.get("shipment").get("carrier").asText()).isEqualTo("GrabExpress");
            assertThat(shipped.get("shipment").get("trackingNumber").asText()).isEqualTo("GE123");
            assertThat(productStatus(item)).as("Sold only on completion").isEqualTo("Reserved");
            act(sellerBToken, id, "confirm-receipt").andExpect(status().isForbidden());
            JsonNode completed = readJson(act(buyerToken, id, "confirm-receipt").andExpect(status().isOk()));
            assertThat(completed.get("status").asText()).isEqualTo("COMPLETED");
            assertThat(completed.get("shipment").get("receivedAt").isNull()).isFalse();
            assertThat(productStatus(item)).isEqualTo("Sold");
        }

        @Test
        void shippingWithoutCourierDetailsIsAllowed() throws Exception {
            long id = toPaid(sellerA, "Self delivered", 30_000);
            act(sellerAToken, id, "ship").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DELIVERING"));
            act(sellerAToken, id, "ship").andExpect(status().isConflict());
        }

        @Test
        void anOpenDisputeBlocksCompletionAndPutsThePayoutOnHold() throws Exception {
            long id = toPaid(sellerA, "Disputed item", 80_000);
            act(sellerAToken, id, "ship").andExpect(status().isOk());
            mvc.perform(post("/api/orders/" + id + "/disputes").header("Authorization", bearer(strangerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Not mine\"}")).andExpect(status().isNotFound());
            JsonNode disputed = readJson(mvc.perform(post("/api/orders/" + id + "/disputes").header("Authorization", bearer(buyerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"The item arrived damaged.\"}")).andExpect(status().isCreated()));
            assertThat(disputed.get("disputes").get(0).get("status").asText()).isEqualTo("OPEN");
            assertThat(disputed.get("disputes").get(0).get("openedBy").asText()).isEqualTo("BUYER");
            assertThat(disputed.get("actions").toString()).doesNotContain("CONFIRM_RECEIPT").doesNotContain("OPEN_DISPUTE");
            act(buyerToken, id, "confirm-receipt").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_DISPUTED"));
            mvc.perform(post("/api/orders/" + id + "/disputes").header("Authorization", bearer(sellerAToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Second dispute\"}"))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_DISPUTED"));
            assertThat(orderStatus(id)).isEqualTo("Delivering");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.SellerSettlements WHERE OrderId = ?", Integer.class, id)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Payments WHERE OrderId = ? AND Status = 'Succeeded'", Integer.class, id))
                    .as("no automatic refund").isEqualTo(1);
        }

        @Test
        void disputesNeedAPaidOrderAndPayoutsStayManual() throws Exception {
            long pending = placeOne(sellerA, "Unpaid dispute", 30_000);
            mvc.perform(post("/api/orders/" + pending + "/disputes").header("Authorization", bearer(buyerToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Too early\"}"))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DISPUTE_NOT_ALLOWED"));
            // A completed order with a dispute: the settlement exists but an admin cannot release it (V002 51042).
            long completed = toCompleted(sellerA, "Completed dispute", 30_000);
            mvc.perform(post("/api/orders/" + completed + "/disputes").header("Authorization", bearer(sellerAToken))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Buyer reported a problem by phone.\"}")).andExpect(status().isCreated());
            Integer adminId = jdbc.queryForObject("SELECT MAX(UserId) FROM dbo.Users WHERE Role = 'Admin'", Integer.class);
            assertThatThrownBy(() -> jdbc.update("EXEC dbo.usp_MarkSettlementReleased @OrderId = ?, @AdminId = ?, @PayoutReference = N'TEST-REF'", completed, adminId))
                    .satisfies(ex -> assertThat(com.unimarket.service.order.SqlErrors.numberOf(ex)).isEqualTo(51042));
            assertThat(jdbc.queryForObject("SELECT Status FROM dbo.SellerSettlements WHERE OrderId = ?", String.class, completed)).isEqualTo("Pending");
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
                        .content(json.writeValueAsString(Map.of("email", email, "password", "Secret123")))).andExpect(status().isOk()))
                .get("accessToken").asText();
    }

    /** An approved, available listing of a test seller (created directly; listing creation itself is Stage 3). */
    private int listing(int sellerId, String title, long price) {
        return jdbc.queryForObject("INSERT dbo.Products (SellerId, CategoryId, CampusId, Title, Description, Condition, Price, Status, ModerationStatus) "
                        + "OUTPUT inserted.ProductId VALUES (?, 1, 1, ?, N'A clean, well kept item from a student.', 'Used', ?, 'Available', 'Approved')",
                Integer.class, sellerId, title, price);
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    /**
     * A V003 checkout body: asks POST /api/shipping/quotes as this buyer and picks {@link #CARRIER} for every seller.
     * When no quote can be made (own / unavailable listing), placeholder choices are sent: the listing checks run
     * before the quote check, so such checkouts still fail with their own error code.
     */
    private String checkoutBody(String token, List<Integer> ids, Map<Integer, Long> expectedPrices) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productIds", ids);
        body.put("deliveryZoneId", deliveryZone);
        body.put("shipping", shippingChoices(token, ids));
        body.put("recipientName", "Test Buyer");
        body.put("recipientPhone", "0912 345 678");
        body.put("deliveryAddress", "Dormitory A, room 305");
        body.put("paymentProvider", "MOMO");
        if (expectedPrices != null) {
            body.put("expectedPrices", expectedPrices);
        }
        return json.writeValueAsString(body);
    }

    private List<Map<String, Object>> shippingChoices(String token, List<Integer> ids) throws Exception {
        org.springframework.test.web.servlet.MvcResult quote = mvc.perform(post("/api/shipping/quotes").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("productIds", ids, "deliveryZoneId", deliveryZone)))).andReturn();
        List<Map<String, Object>> choices = new java.util.ArrayList<>();
        if (quote.getResponse().getStatus() == 200) {
            for (JsonNode group : json.readTree(quote.getResponse().getContentAsString()).get("groups")) {
                for (JsonNode option : group.get("options")) {
                    if (CARRIER.equals(option.get("carrier").asText())) {
                        choices.add(Map.of("sellerId", group.get("sellerId").asInt(), "carrier", CARRIER,
                                "quoteToken", option.get("quoteToken").asText()));
                    }
                }
            }
            return choices;
        }
        for (Integer seller : jdbc.queryForList("SELECT DISTINCT SellerId FROM dbo.Products WHERE ProductId IN ("
                + ids.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(",")) + ")", Integer.class)) {
            choices.add(Map.of("sellerId", seller, "carrier", CARRIER, "quoteToken", "not-quoted"));
        }
        return choices;
    }

    private JsonNode checkout(String token, List<Integer> ids, Map<Integer, Long> expectedPrices) throws Exception {
        return readJson(mvc.perform(post("/api/checkout").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(checkoutBody(token, ids, expectedPrices))).andExpect(status().isCreated()));
    }

    private void expectCheckout(String token, String body, HttpStatus status, String code) throws Exception {
        mvc.perform(post("/api/checkout").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(status.value())).andExpect(jsonPath("$.code").value(code));
    }

    private long placeOne(int sellerId, String title, long price) throws Exception {
        return checkout(buyerToken, List.of(listing(sellerId, title, price)), null).get("orders").get(0).get("id").asLong();
    }

    private String sellerToken(int sellerId) {
        return sellerId == sellerA ? sellerAToken : sellerBToken;
    }

    private long confirmedOrder(int sellerId, String title, long price) throws Exception {
        long id = placeOne(sellerId, title, price);
        act(sellerToken(sellerId), id, "confirm").andExpect(status().isOk());
        return id;
    }

    private long toPaid(int sellerId, String title, long price) throws Exception {
        long id = confirmedOrder(sellerId, title, price);
        assertThat(payWithSimulator(id, true).get("status").asText()).isEqualTo("PAID");
        return id;
    }

    private long toCompleted(int sellerId, String title, long price) throws Exception {
        long id = toPaid(sellerId, title, price);
        act(sellerToken(sellerId), id, "ship").andExpect(status().isOk());
        act(buyerToken, id, "confirm-receipt").andExpect(status().isOk());
        return id;
    }

    private void startPayment(long orderId) throws Exception {
        mvc.perform(post("/api/orders/" + orderId + "/payments").header("Authorization", bearer(buyerToken))).andExpect(status().isCreated());
    }

    /** Starts (or resumes) the payment and finishes it on the simulator, as the buyer would. */
    private JsonNode payWithSimulator(long orderId, boolean success) throws Exception {
        JsonNode attempt = readJson(mvc.perform(post("/api/orders/" + orderId + "/payments").header("Authorization", bearer(buyerToken))));
        return readJson(mvc.perform(post("/api/dev/payment-simulator/payments/" + attempt.get("paymentId").asLong() + "/complete")
                        .header("Authorization", bearer(buyerToken)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"outcome\":\"" + (success ? "SUCCESS" : "FAILURE") + "\"}"))
                .andExpect(status().isOk()));
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

    private String requestKey(long orderId) {
        return jdbc.queryForObject("SELECT TOP 1 RequestKey FROM dbo.Payments WHERE OrderId = ? ORDER BY PaymentId DESC", String.class, orderId);
    }

    /** Moves an order's timeline back (placement, confirmation deadline and confirmation), as if time had passed. */
    private void moveOrderBack(long orderId, int minutes) {
        jdbc.update("UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -?, CreatedAt), ConfirmBy = DATEADD(minute, -?, ConfirmBy), "
                + "ConfirmedAt = DATEADD(minute, -?, ConfirmedAt), PaidAt = DATEADD(minute, -?, PaidAt) WHERE OrderId = ?",
                minutes, minutes, minutes, minutes, orderId);
    }

    private void movePaymentBack(long orderId, int minutes) {
        jdbc.update("UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -?, CreatedAt) WHERE OrderId = ? AND Status = 'Pending'", minutes, orderId);
    }

    private ResultActions act(String token, long orderId, String action) throws Exception {
        return mvc.perform(post("/api/orders/" + orderId + "/" + action).header("Authorization", bearer(token)));
    }

    private String orderStatus(long orderId) {
        return jdbc.queryForObject("SELECT Status FROM dbo.Orders WHERE OrderId = ?", String.class, orderId);
    }

    private String productStatus(int productId) {
        return jdbc.queryForObject("SELECT Status FROM dbo.Products WHERE ProductId = ?", String.class, productId);
    }

    private long ordersOf(int buyerId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Orders WHERE BuyerId = ?", Long.class, buyerId);
    }

    private JsonNode getJson(String url, String token) throws Exception {
        return readJson(mvc.perform(get(url).header("Authorization", bearer(token))).andExpect(status().isOk()));
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static List<Long> ids(JsonNode pageOrList) {
        JsonNode items = pageOrList.has("items") ? pageOrList.get("items") : pageOrList;
        List<Long> ids = new ArrayList<>();
        items.forEach(o -> ids.add(o.get("id").asLong()));
        return ids;
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

    /** Runs the calls at the same moment over real HTTP; results in call order. */
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

    /** Checksum of the demo rows (users 1-17, listings 1-50, orders 1-12 with payments, settlements, history, carts). */
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
