package com.unimarket.service.order;

import com.unimarket.common.ErrorCode;
import com.unimarket.dto.order.CartResponse;
import com.unimarket.dto.order.OrderResponse;
import com.unimarket.exception.ApiException;
import com.unimarket.service.product.ProductMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * The signed-in buyer's cart ({@code CartItems}). Quantity is always 1; the database trigger
 * {@code trg_Cart_Validate} is the final guard against own or unavailable listings (THROW 51002).
 *
 * <p>The cart stores listing ids only (no price snapshot in the schema): prices and availability are always
 * read fresh. Listings that became unavailable stay in the cart and are reported with a reason until the buyer
 * removes them; {@code usp_Checkout} removes the ordered ones.</p>
 */
@Service
@Profile("!nodb")
public class CartService {

    private final OrderQueries queries;
    private final JdbcTemplate jdbc;
    private final int maxItems;

    public CartService(OrderQueries queries, JdbcTemplate jdbc,
                       @Value("${unimarket.cart.max-items}") int maxItems) {
        this.queries = queries;
        this.jdbc = jdbc;
        this.maxItems = maxItems;
    }

    /** The cart grouped by seller (one future order per seller), plus the unavailable listings. */
    public CartResponse view(int buyerId) {
        Map<Integer, List<CartResponse.CartItem>> bySeller = new LinkedHashMap<>();
        Map<Integer, String> sellerNames = new LinkedHashMap<>();
        List<CartResponse.CartItem> unavailable = new ArrayList<>();
        List<OrderQueries.ListingRow> rows = queries.cart(buyerId);
        for (OrderQueries.ListingRow row : rows) {
            CartResponse.CartItem item = item(row, buyerId, null);
            if (item.purchasable()) {
                bySeller.computeIfAbsent(row.sellerId(), k -> new ArrayList<>()).add(item);
                sellerNames.put(row.sellerId(), row.sellerName());
            } else {
                unavailable.add(item);
            }
        }
        List<CartResponse.SellerGroup> groups = groups(bySeller, sellerNames);
        long subtotal = groups.stream().mapToLong(CartResponse.SellerGroup::subtotal).sum();
        long fees = groups.stream().mapToLong(CartResponse.SellerGroup::shippingFee).sum();
        return new CartResponse(groups, unavailable, rows.size(), subtotal, fees, subtotal + fees,
                CartResponse.ShippingFeePolicy.simulatedDistance(false));
    }

    /** One group per seller = one future order. Shipping is quoted separately (V003), so the fee here is 0. */
    private List<CartResponse.SellerGroup> groups(Map<Integer, List<CartResponse.CartItem>> bySeller, Map<Integer, String> sellerNames) {
        long fee = 0;
        List<CartResponse.SellerGroup> groups = new ArrayList<>();
        bySeller.forEach((sellerId, items) -> {
            long subtotal = items.stream().mapToLong(CartResponse.CartItem::price).sum();
            groups.add(new CartResponse.SellerGroup(new OrderResponse.Party(sellerId, sellerNames.get(sellerId)), items, subtotal, fee, subtotal + fee));
        });
        return groups;
    }

    /**
     * Adds a listing (no duplicates: adding it again returns {@code added = false}).
     *
     * @throws ApiException 404 unknown or not public; 409 OWN_LISTING; 409 LISTING_UNAVAILABLE (reserved, sold…);
     *                      400 CART_FULL
     */
    public CartResponse.AddResult add(int buyerId, int productId) {
        OrderQueries.ListingRow listing = queries.listings(List.of(productId)).get(productId);
        if (listing == null || !(isPublic(listing) || listing.sellerId() == buyerId)) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Listing not found.");
        }
        String reason = listing.unavailableReason(buyerId);
        if ("OWN_LISTING".equals(reason)) {
            throw new ApiException(ErrorCode.OWN_LISTING);
        }
        if (reason != null) {
            throw new ApiException(ErrorCode.LISTING_UNAVAILABLE, "This listing is no longer available (" + reason + ").");
        }
        Integer present = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.CartItems WHERE UserId = ? AND ProductId = ?", Integer.class, buyerId, productId);
        if (present != null && present > 0) {
            return new CartResponse.AddResult(productId, false);
        }
        if (queries.cartSize(buyerId) >= maxItems) {
            throw new ApiException(ErrorCode.CART_FULL, "Your cart can hold at most " + maxItems + " listings.");
        }
        try {
            jdbc.update("INSERT dbo.CartItems (UserId, ProductId) VALUES (?, ?)", buyerId, productId);
        } catch (DataAccessException ex) {
            if (SqlErrors.isDuplicateKey(ex)) {
                return new CartResponse.AddResult(productId, false);
            }
            if (SqlErrors.numberOf(ex) == 51002) {
                throw new ApiException(ErrorCode.LISTING_UNAVAILABLE, "This listing is no longer available.");
            }
            throw ex;
        }
        return new CartResponse.AddResult(productId, true);
    }

    /** Removes a listing from the cart (idempotent). */
    public void remove(int buyerId, int productId) {
        jdbc.update("DELETE FROM dbo.CartItems WHERE UserId = ? AND ProductId = ?", buyerId, productId);
    }

    /** Empties the cart. */
    public void clear(int buyerId) {
        jdbc.update("DELETE FROM dbo.CartItems WHERE UserId = ?", buyerId);
    }

    /**
     * Checks listings before checkout without placing an order: availability now and, when given, whether the price
     * the buyer saw is still the price.
     *
     * @param productIds     listings to check; null or empty = the whole cart
     * @param expectedPrices optional prices the buyer saw, by listing id
     */
    public CartResponse.Validation validate(int buyerId, List<Integer> productIds, Map<Integer, Long> expectedPrices) {
        List<Integer> ids = productIds == null || productIds.isEmpty()
                ? queries.cart(buyerId).stream().map(OrderQueries.ListingRow::productId).toList()
                : productIds.stream().distinct().toList();
        Map<Integer, OrderQueries.ListingRow> rows = queries.listings(ids);
        Map<Integer, Long> expected = expectedPrices == null ? Map.of() : expectedPrices;
        List<CartResponse.CartItem> items = new ArrayList<>();
        for (Integer id : ids) {
            OrderQueries.ListingRow row = rows.get(id);
            if (row == null || !(isPublic(row) || row.sellerId() == buyerId)) {
                items.add(new CartResponse.CartItem(id, null, 0, null, 0, "NOT_FOUND", false, "NOT_FOUND", expected.get(id), null, null));
            } else {
                items.add(item(row, buyerId, expected.get(id)));
            }
        }
        boolean ready = !items.isEmpty() && items.stream().allMatch(i -> i.purchasable() && !Boolean.TRUE.equals(i.priceChanged()));
        // Checkout preview: the orders that would be created now (purchasable listings), with delivery fees.
        Map<Integer, List<CartResponse.CartItem>> bySeller = new LinkedHashMap<>();
        Map<Integer, String> sellerNames = new LinkedHashMap<>();
        for (CartResponse.CartItem item : items) {
            if (item.purchasable()) {
                bySeller.computeIfAbsent(item.sellerId(), k -> new ArrayList<>()).add(item);
                sellerNames.put(item.sellerId(), rows.get(item.productId()).sellerName());
            }
        }
        List<CartResponse.SellerGroup> groups = groups(bySeller, sellerNames);
        long subtotal = groups.stream().mapToLong(CartResponse.SellerGroup::subtotal).sum();
        long fees = groups.stream().mapToLong(CartResponse.SellerGroup::shippingFee).sum();
        return new CartResponse.Validation(ready, items, groups, subtotal, fees, subtotal + fees,
                CartResponse.ShippingFeePolicy.simulatedDistance(false));
    }

    private static CartResponse.CartItem item(OrderQueries.ListingRow row, int buyerId, Long expectedPrice) {
        String reason = row.unavailableReason(buyerId);
        long price = OrderMapper.vnd(row.price());
        return new CartResponse.CartItem(row.productId(), row.title(), price, ProductMapper.publicUrl(row.imageUrl()), row.sellerId(),
                OrderValues.upper(row.status()), reason == null, reason, expectedPrice,
                expectedPrice == null ? null : !Objects.equals(expectedPrice, price), row.addedAt());
    }

    /** Public listing (approved; available, reserved or sold), like the product page rule of Stage 3. */
    static boolean isPublic(OrderQueries.ListingRow row) {
        return "Approved".equals(row.moderationStatus())
                && ("Available".equals(row.status()) || "Reserved".equals(row.status()) || "Sold".equals(row.status()));
    }
}
