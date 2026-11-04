package com.unimarket.controller;

import com.unimarket.dto.chat.ChatDtos;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.chat.ChatService;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Buyer / seller chat (V004). Signed-in users only; identity always comes from the token. Reporting a conversation uses
 * {@code POST /api/reports} with {@code targetType=CONVERSATION}; admins read reported conversations through
 * {@code GET /api/admin/conversations/{id}}.
 */
@RestController
@Profile("!nodb")
public class ChatController {

    private final ChatService chat;

    public ChatController(ChatService chat) {
        this.chat = chat;
    }

    /** Opens the conversation about a listing, or returns the one that already exists. */
    @PostMapping("/api/conversations")
    public ChatDtos.Conversation start(@Valid @RequestBody ChatDtos.StartRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        return chat.start(request.productId(), user);
    }

    @GetMapping("/api/conversations")
    public List<ChatDtos.Conversation> mine(@AuthenticationPrincipal AuthenticatedUser user) {
        return chat.mine(user);
    }

    @GetMapping("/api/conversations/unread-count")
    public ChatDtos.UnreadCount unread(@AuthenticationPrincipal AuthenticatedUser user) {
        return chat.unread(user);
    }

    @GetMapping("/api/conversations/{id}")
    public ChatDtos.Conversation conversation(@PathVariable int id, @AuthenticationPrincipal AuthenticatedUser user) {
        return chat.conversation(id, user);
    }

    /** Ascending. {@code after}: newer than this id (polling); otherwise the newest {@code limit}, or older than {@code before}. */
    @GetMapping("/api/conversations/{id}/messages")
    public List<ChatDtos.Message> messages(@PathVariable int id, @RequestParam(required = false) Long after,
                                           @RequestParam(required = false) Long before, @RequestParam(defaultValue = "50") int limit,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return chat.messages(id, after, before, limit, user);
    }

    @PostMapping("/api/conversations/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public ChatDtos.Message send(@PathVariable int id, @RequestBody ChatDtos.SendRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        return chat.send(id, request.body(), user);
    }

    @PostMapping("/api/conversations/{id}/read")
    public ChatDtos.Conversation read(@PathVariable int id, @AuthenticationPrincipal AuthenticatedUser user) {
        return chat.markRead(id, user);
    }
}
