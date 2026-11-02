package com.unimarket.controller;

import com.unimarket.dto.product.ProductSummaryResponse;
import com.unimarket.dto.product.ReferenceDataResponses;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.product.FavoriteService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * "Saved items" of the signed-in user (token required). The user id always comes from the token.
 */
@RestController
@Profile("!nodb")
public class FavoriteController {

    private final FavoriteService favorites;

    public FavoriteController(FavoriteService favorites) {
        this.favorites = favorites;
    }

    /** Saved listings, newest first (empty list when none). */
    @GetMapping("/api/me/favorites")
    public List<ProductSummaryResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return favorites.list(user.id());
    }

    /** Saves a listing: 201 when newly saved, 200 when it was already saved (no duplicate). */
    @PutMapping("/api/me/favorites/{productId}")
    public ResponseEntity<ReferenceDataResponses.FavoriteResponse> add(@PathVariable int productId,
                                                                      @AuthenticationPrincipal AuthenticatedUser user) {
        ReferenceDataResponses.FavoriteResponse result = favorites.add(user.id(), productId);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result);
    }

    /** Un-saves a listing (idempotent). */
    @DeleteMapping("/api/me/favorites/{productId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable int productId, @AuthenticationPrincipal AuthenticatedUser user) {
        favorites.remove(user.id(), productId);
    }
}
