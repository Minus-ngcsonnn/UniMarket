package com.unimarket.dto.chat;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.unimarket.dto.admin.AdminDtos;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.Instant;
import java.util.List;

/** Request and response types of the buyer / seller chat ({@code /api/conversations/**}, V004). */
public final class ChatDtos {

    private ChatDtos() {
    }

    /** @param productId the listing the buyer asks about */
    public record StartRequest(@NotNull @Positive Integer productId) {
    }

    /** @param body plain text, 1–2000 characters after trimming (checked by the service) */
    public record SendRequest(String body) {
    }

    /** The listing a conversation is about. @param status AVAILABLE, RESERVED, SOLD, REMOVED, DRAFT */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ListingRef(int id, String title, long price, String status, String mainImageUrl) {
    }

    /**
     * One conversation as seen by a participant.
     *
     * @param myRole        BUYER or SELLER: the side of the signed-in user
     * @param counterpart   the other participant
     * @param counterpartActive false when the other account is suspended or closed (sending is refused)
     * @param lastMessage   newest message, or null for a conversation without messages
     * @param unreadCount   messages from the other side newer than my last read message
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Conversation(int id, ListingRef listing, String myRole, AdminDtos.Ref counterpart, boolean counterpartActive,
                               Message lastMessage, int unreadCount, Instant createdAt, Instant lastMessageAt) {
    }

    /** @param mine true when the signed-in user sent it (participant views only) */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Message(long id, int senderId, String body, Instant createdAt, Boolean mine) {
    }

    /** @param count unread messages over all my conversations */
    public record UnreadCount(int count) {
    }

    /**
     * A reported conversation for admins: both participants and every message (admins can read a conversation only
     * when it was reported; each read is written to {@code AdminActions}).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AdminConversation(int id, ListingRef listing, AdminDtos.Ref buyer, String buyerStatus, AdminDtos.Ref seller,
                                    String sellerStatus, Instant createdAt, List<Message> messages) {
    }
}
