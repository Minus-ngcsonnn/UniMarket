package com.unimarket.dto.order;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/**
 * The signed-in buyer's cart, grouped by seller as checkout will group it (one order per seller).
 *
 * <p>Prices and availability are read now from the database; the cart stores no price snapshot
 * ({@code CartItems} has none), so a price the buyer saw earlier can be compared with
 * {@code POST /api/cart/validate}.</p>
 *
 * @param groups      purchasable listings by seller, each with the delivery fee and total of that future order
 * @param unavailable listings that can no longer be bought, with the reason
 * @param itemCount   number of listings in the cart
 * @param subtotal    sum of purchasable prices
 * @param shippingFee sum of the delivery fees of all groups (one fee per order)
 * @param total       what checking out everything purchasable would cost
 * @param shippingFeePolicy how the delivery fee was determined (provisional, see {@link ShippingFeePolicy})
 */
public record CartResponse(List<SellerGroup> groups, List<CartItem> unavailable, int itemCount, long subtotal, long shippingFee,
                           long total, ShippingFeePolicy shippingFeePolicy) {

    /**
     * How the delivery fee shown was determined. The final calculation method is a PENDING team decision; the MVP
     * uses a server-configured flat fee per order (possibly 0). A fee of 0 is NOT an approved free-shipping policy.
     *
     * @param method   CONFIGURED_FLAT_PER_ORDER (the only method today)
     * @param feePerOrder fee added to each order (one order per seller)
     * @param approved false: the calculation method is not approved yet
     * @param note     text for developers / UI
     */
    public record ShippingFeePolicy(String method, long feePerOrder, boolean approved, String note) {

        public static ShippingFeePolicy provisional(long feePerOrder) {
            return new ShippingFeePolicy("CONFIGURED_FLAT_PER_ORDER", feePerOrder, false,
                    "Provisional: delivery fee set by server configuration, added to each order (one per seller). "
                            + "The final shipping fee method is pending team approval; 0 is not a free-shipping policy.");
        }
    }

    /**
     * @param seller      seller of these listings
     * @param items       purchasable listings of this seller
     * @param subtotal    sum of their prices
     * @param shippingFee delivery fee of the order this group becomes (configured, see the API doc)
     * @param total       subtotal + delivery fee
     */
    public record SellerGroup(OrderResponse.Party seller, List<CartItem> items, long subtotal, long shippingFee, long total) {
    }

    /**
     * @param productId  listing id
     * @param title      current title
     * @param price      current price (VND)
     * @param imageUrl   main photo
     * @param sellerId   seller
     * @param status     listing status (AVAILABLE, RESERVED, SOLD, REMOVED, DRAFT)
     * @param purchasable true when it can be checked out now
     * @param reason     why not: RESERVED, SOLD, REMOVED, UNDER_REVIEW, SELLER_UNAVAILABLE, CATEGORY_UNAVAILABLE, OWN_LISTING
     * @param expectedPrice the price the buyer saw (validation only)
     * @param priceChanged  true when {@code expectedPrice} differs (validation only)
     * @param addedAt    when it was added to the cart (UTC)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CartItem(int productId, String title, long price, String imageUrl, int sellerId, String status, boolean purchasable,
                           String reason, Long expectedPrice, Boolean priceChanged, Instant addedAt) {
    }

    /**
     * Result of {@code POST /api/cart/validate}: the checkout preview shown before the buyer confirms.
     *
     * @param ready       true when every checked listing is purchasable and no price changed
     * @param items       the checked listings
     * @param groups      the orders checkout would create now (purchasable listings by seller) with their fees
     * @param subtotal    merchandise total of those orders
     * @param shippingFee sum of their delivery fees
     * @param total       what the buyer would pay in total
     * @param shippingFeePolicy how the delivery fee was determined (provisional)
     */
    public record Validation(boolean ready, List<CartItem> items, List<SellerGroup> groups, long subtotal, long shippingFee, long total,
                             ShippingFeePolicy shippingFeePolicy) {
    }

    /** @param productId listing; @param added false when it was already in the cart (no duplicate) */
    public record AddResult(int productId, boolean added) {
    }
}
