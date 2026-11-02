package com.unimarket.controller;

import com.unimarket.dto.order.CartResponse;
import com.unimarket.dto.order.OrderRequests;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.order.CartService;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in buyer's cart (token required). The buyer always comes from the token. */
@RestController
@Profile("!nodb")
public class CartController {

    private final CartService cart;

    public CartController(CartService cart) {
        this.cart = cart;
    }

    /** Cart grouped by seller, with current prices, delivery fees and unavailable listings. */
    @GetMapping("/api/cart")
    public CartResponse view(@AuthenticationPrincipal AuthenticatedUser user) {
        return cart.view(user.id());
    }

    /** Adds a listing: 201 when added, 200 when it was already in the cart. */
    @PutMapping("/api/cart/items/{productId}")
    public ResponseEntity<CartResponse.AddResult> add(@PathVariable int productId, @AuthenticationPrincipal AuthenticatedUser user) {
        CartResponse.AddResult result = cart.add(user.id(), productId);
        return ResponseEntity.status(result.added() ? HttpStatus.CREATED : HttpStatus.OK).body(result);
    }

    /** Removes a listing (idempotent). */
    @DeleteMapping("/api/cart/items/{productId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable int productId, @AuthenticationPrincipal AuthenticatedUser user) {
        cart.remove(user.id(), productId);
    }

    /** Empties the cart. */
    @DeleteMapping("/api/cart")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear(@AuthenticationPrincipal AuthenticatedUser user) {
        cart.clear(user.id());
    }

    /** Checks listings (default: the whole cart) and optional expected prices before checkout. Places nothing. */
    @PostMapping("/api/cart/validate")
    public CartResponse.Validation validate(@Valid @RequestBody(required = false) OrderRequests.CartValidationRequest request,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
        return request == null ? cart.validate(user.id(), null, null)
                : cart.validate(user.id(), request.productIds(), request.expectedPrices());
    }
}
