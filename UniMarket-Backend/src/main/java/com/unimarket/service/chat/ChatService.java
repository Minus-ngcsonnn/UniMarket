package com.unimarket.service.chat;

import com.unimarket.common.ApiErrorResponse;
import com.unimarket.common.ErrorCode;
import com.unimarket.dto.admin.AdminDtos;
import com.unimarket.dto.chat.ChatDtos;
import com.unimarket.entity.UserRole;
import com.unimarket.exception.ApiException;
import com.unimarket.exception.ValidationException;
import com.unimarket.security.AuthenticatedUser;
import com.unimarket.service.admin.AdminSupport;
import com.unimarket.service.order.OrderValues;
import com.unimarket.service.product.ProductMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * Buyer / seller chat (V004: {@code Conversations}, {@code ConversationMessages}).
 *
 * <p>Rules: one conversation per (listing, buyer); only students start chats, never about their own listing, and only
 * about an approved listing that is still available or reserved (an existing conversation stays usable after the sale).
 * Only the two participants read or write it. Messages are plain text (1–{@value #MAX_BODY} characters) and are never
 * edited or deleted, so a reported conversation is complete when an admin reviews it. Admins can read a conversation
 * only when it was reported (see {@link #adminView}); every such read is audited.</p>
 *
 * <p>The frontend polls ({@code GET .../messages?after=<lastId>}); there is no push channel.</p>
 */
@Service
@Profile("!nodb")
public class ChatService {

    public static final int MAX_BODY = 2000;
    /** At most this many messages per user per minute (spam guard). */
    public static final int MAX_MESSAGES_PER_MINUTE = 20;
    private static final int MAX_PAGE = 100;
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final AdminSupport support;

    public ChatService(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager transactionManager, AdminSupport support) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.support = support;
    }

    // ------------------------------------------------------------------ participants

    /** Opens (or returns the existing) conversation of the signed-in buyer about a listing. */
    public ChatDtos.Conversation start(int productId, AuthenticatedUser me) {
        if (me.role() != UserRole.STUDENT) {
            throw new ApiException(ErrorCode.CHAT_NOT_ALLOWED, "Only student accounts can chat about listings.");
        }
        Map<String, Object> listing = jdbc.queryForList("SELECT SellerId, Status FROM dbo.Products WHERE ProductId = :id "
                        + "AND ModerationStatus = 'Approved' AND Status IN ('Available', 'Reserved', 'Sold')", Map.of("id", productId))
                .stream().findFirst().orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Listing not found."));
        int sellerId = ((Number) listing.get("SellerId")).intValue();
        if (sellerId == me.id()) {
            throw new ApiException(ErrorCode.CHAT_NOT_ALLOWED, "You cannot message yourself about your own listing.");
        }
        MapSqlParameterSource params = new MapSqlParameterSource("product", productId).addValue("buyer", me.id()).addValue("seller", sellerId);
        Integer existing = existingConversation(params);
        if (existing != null) {
            return conversation(existing, me);
        }
        if ("Sold".equals(listing.get("Status"))) {
            throw new ApiException(ErrorCode.CHAT_NOT_ALLOWED, "This listing is sold; new chats about it are closed.");
        }
        Integer seller = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE UserId = :seller AND Status = 'Active'", params, Integer.class);
        if (seller == null || seller == 0) {
            throw new ApiException(ErrorCode.CHAT_UNAVAILABLE);
        }
        Integer id;
        try {
            id = jdbc.queryForObject("INSERT dbo.Conversations (ProductId, BuyerId, SellerId) OUTPUT inserted.ConversationId "
                    + "VALUES (:product, :buyer, :seller)", params, Integer.class);
            log.info("Conversation {} started by user {} about listing {}", id, me.id(), productId);
        } catch (DuplicateKeyException race) {
            id = existingConversation(params); // a parallel request created it first
        }
        return conversation(id, me);
    }

    /** My conversations, newest activity first. Sellers only see conversations in which a message was written. */
    public List<ChatDtos.Conversation> mine(AuthenticatedUser me) {
        return jdbc.query(SUMMARY_SQL + " WHERE (c.BuyerId = :me OR (c.SellerId = :me AND c.LastMessageAt IS NOT NULL))"
                        + " ORDER BY COALESCE(c.LastMessageAt, c.CreatedAt) DESC, c.ConversationId DESC",
                Map.of("me", me.id()), (rs, i) -> summary(rs, me.id()));
    }

    public ChatDtos.Conversation conversation(int conversationId, AuthenticatedUser me) {
        return jdbc.query(SUMMARY_SQL + " WHERE c.ConversationId = :id AND (c.BuyerId = :me OR c.SellerId = :me)",
                        Map.of("id", conversationId, "me", me.id()), (rs, i) -> summary(rs, me.id()))
                .stream().findFirst().orElseThrow(ChatService::notFound);
    }

    /** Sum of unread messages over all my conversations (header badge). */
    public ChatDtos.UnreadCount unread(AuthenticatedUser me) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.ConversationMessages m JOIN dbo.Conversations c ON c.ConversationId = m.ConversationId
                WHERE (c.BuyerId = :me OR c.SellerId = :me) AND m.SenderId <> :me
                  AND m.MessageId > ISNULL(CASE WHEN c.BuyerId = :me THEN c.BuyerLastReadMessageId ELSE c.SellerLastReadMessageId END, 0)""",
                Map.of("me", me.id()), Integer.class);
        return new ChatDtos.UnreadCount(count == null ? 0 : count);
    }

    /**
     * Messages in ascending order. With {@code after}: the messages newer than that id (polling). Otherwise the newest
     * {@code limit} messages, or those older than {@code before} (loading history).
     */
    public List<ChatDtos.Message> messages(int conversationId, Long after, Long before, int limit, AuthenticatedUser me) {
        requireParticipant(conversationId, me);
        return page(conversationId, after, before, limit, me.id());
    }

    /** Sends a message. 429 above {@value #MAX_MESSAGES_PER_MINUTE} messages a minute; 409 when the other account is inactive. */
    public ChatDtos.Message send(int conversationId, String body, AuthenticatedUser me) {
        String text = body == null ? "" : body.strip();
        if (text.isEmpty() || text.length() > MAX_BODY) {
            throw new ValidationException(List.of(new ApiErrorResponse.FieldError("body", "must be 1 to " + MAX_BODY + " characters")));
        }
        Map<String, Object> row = requireParticipant(conversationId, me);
        int other = ((Number) row.get("BuyerId")).intValue() == me.id() ? ((Number) row.get("SellerId")).intValue() : ((Number) row.get("BuyerId")).intValue();
        MapSqlParameterSource params = new MapSqlParameterSource("id", conversationId).addValue("me", me.id()).addValue("other", other).addValue("body", text);
        Long messageId = transaction.execute(status -> {
            Integer active = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Users WHERE UserId = :other AND Status = 'Active'", params, Integer.class);
            if (active == null || active == 0) {
                throw new ApiException(ErrorCode.CHAT_UNAVAILABLE);
            }
            Integer recent = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.ConversationMessages "
                    + "WHERE SenderId = :me AND CreatedAt >= DATEADD(SECOND, -60, SYSUTCDATETIME())", params, Integer.class);
            if (recent != null && recent >= MAX_MESSAGES_PER_MINUTE) {
                throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, "You are sending messages too quickly. Wait a minute and try again.");
            }
            Long id = jdbc.queryForObject("INSERT dbo.ConversationMessages (ConversationId, SenderId, Body) OUTPUT inserted.MessageId "
                    + "VALUES (:id, :me, :body)", params, Long.class);
            jdbc.update("""
                    UPDATE dbo.Conversations SET LastMessageAt = SYSUTCDATETIME(),
                        BuyerLastReadMessageId = CASE WHEN BuyerId = :me THEN :msg ELSE BuyerLastReadMessageId END,
                        SellerLastReadMessageId = CASE WHEN SellerId = :me THEN :msg ELSE SellerLastReadMessageId END
                    WHERE ConversationId = :id""", new MapSqlParameterSource(params.getValues()).addValue("msg", id));
            return id;
        });
        return jdbc.query(MESSAGE_SQL + " WHERE m.MessageId = :msg", Map.of("msg", messageId), (rs, i) -> message(rs, me.id())).getFirst();
    }

    /** Marks every message of the conversation as read by me. */
    public ChatDtos.Conversation markRead(int conversationId, AuthenticatedUser me) {
        requireParticipant(conversationId, me);
        jdbc.update("""
                UPDATE c SET
                    BuyerLastReadMessageId = CASE WHEN c.BuyerId = :me THEN x.LastId ELSE c.BuyerLastReadMessageId END,
                    SellerLastReadMessageId = CASE WHEN c.SellerId = :me THEN x.LastId ELSE c.SellerLastReadMessageId END
                FROM dbo.Conversations c
                CROSS APPLY (SELECT MAX(MessageId) AS LastId FROM dbo.ConversationMessages WHERE ConversationId = c.ConversationId) x
                WHERE c.ConversationId = :id AND x.LastId IS NOT NULL""", Map.of("id", conversationId, "me", me.id()));
        return conversation(conversationId, me);
    }

    /** {@code [buyerId, sellerId]} of a conversation the user takes part in (for reports). */
    public int[] participants(int conversationId, AuthenticatedUser me) {
        Map<String, Object> row = requireParticipant(conversationId, me);
        return new int[]{((Number) row.get("BuyerId")).intValue(), ((Number) row.get("SellerId")).intValue()};
    }

    // ------------------------------------------------------------------ admins

    /**
     * A reported conversation with every message, for the admin handling the report. Conversations without any report
     * stay private (404). Each read is recorded in {@code AdminActions} ("View reported conversation").
     */
    public ChatDtos.AdminConversation adminView(int conversationId, AuthenticatedUser admin) {
        Integer reports = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.Reports WHERE ConversationId = :id", Map.of("id", conversationId), Integer.class);
        if (reports == null || reports == 0) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Conversation not found or not reported.");
        }
        ChatDtos.AdminConversation head = jdbc.query("""
                SELECT c.ConversationId, c.ProductId, p.Title, p.Price, p.Status AS ProductStatus, im.ImageUrl, c.CreatedAt,
                       c.BuyerId, b.FullName AS BuyerName, b.Status AS BuyerStatus, c.SellerId, s.FullName AS SellerName, s.Status AS SellerStatus
                FROM dbo.Conversations c
                JOIN dbo.Products p ON p.ProductId = c.ProductId
                JOIN dbo.Users b ON b.UserId = c.BuyerId
                JOIN dbo.Users s ON s.UserId = c.SellerId
                OUTER APPLY (SELECT TOP(1) ImageUrl FROM dbo.ProductImages WHERE ProductId = p.ProductId ORDER BY SortOrder, ImageId) im
                WHERE c.ConversationId = :id""", Map.of("id", conversationId), (rs, i) -> new ChatDtos.AdminConversation(
                rs.getInt("ConversationId"), listing(rs), new AdminDtos.Ref(rs.getInt("BuyerId"), rs.getString("BuyerName")),
                OrderValues.upper(rs.getString("BuyerStatus")), new AdminDtos.Ref(rs.getInt("SellerId"), rs.getString("SellerName")),
                OrderValues.upper(rs.getString("SellerStatus")), utc(rs, "CreatedAt"), null)).getFirst();
        List<ChatDtos.Message> all = jdbc.query(MESSAGE_SQL + " WHERE m.ConversationId = :id ORDER BY m.MessageId",
                Map.of("id", conversationId), (rs, i) -> message(rs, null));
        support.audit(admin.id(), "View reported conversation", "Conversation", conversationId, null);
        return new ChatDtos.AdminConversation(head.id(), head.listing(), head.buyer(), head.buyerStatus(), head.seller(), head.sellerStatus(),
                head.createdAt(), all);
    }

    // ------------------------------------------------------------------ helpers

    private Integer existingConversation(MapSqlParameterSource params) {
        return jdbc.queryForList("SELECT ConversationId FROM dbo.Conversations WHERE ProductId = :product AND BuyerId = :buyer",
                params, Integer.class).stream().findFirst().orElse(null);
    }

    private Map<String, Object> requireParticipant(int conversationId, AuthenticatedUser me) {
        return jdbc.queryForList("SELECT BuyerId, SellerId FROM dbo.Conversations WHERE ConversationId = :id AND (BuyerId = :me OR SellerId = :me)",
                Map.of("id", conversationId, "me", me.id())).stream().findFirst().orElseThrow(ChatService::notFound);
    }

    private List<ChatDtos.Message> page(int conversationId, Long after, Long before, int limit, int me) {
        int size = Math.max(1, Math.min(limit, MAX_PAGE));
        MapSqlParameterSource params = new MapSqlParameterSource("id", conversationId).addValue("size", size);
        if (after != null) {
            return jdbc.query("SELECT TOP (:size) * FROM (" + MESSAGE_SQL + " WHERE m.ConversationId = :id AND m.MessageId > :after) x ORDER BY x.MessageId",
                    params.addValue("after", after), (rs, i) -> message(rs, me));
        }
        String older = before == null ? "" : " AND m.MessageId < :before";
        return jdbc.query("SELECT * FROM (SELECT TOP (:size) * FROM (" + MESSAGE_SQL + " WHERE m.ConversationId = :id" + older
                        + ") y ORDER BY y.MessageId DESC) x ORDER BY x.MessageId",
                params.addValue("before", before), (rs, i) -> message(rs, me));
    }

    private static final String SUMMARY_SQL = """
            SELECT c.ConversationId, c.ProductId, p.Title, p.Price, p.Status AS ProductStatus, im.ImageUrl,
                   c.BuyerId, c.SellerId, b.FullName AS BuyerName, b.Status AS BuyerStatus, s.FullName AS SellerName, s.Status AS SellerStatus,
                   c.CreatedAt, c.LastMessageAt, lm.MessageId AS LastId, lm.SenderId AS LastSender, lm.Body AS LastBody, lm.CreatedAt AS LastAt,
                   (SELECT COUNT(*) FROM dbo.ConversationMessages m WHERE m.ConversationId = c.ConversationId AND m.SenderId <> :me
                      AND m.MessageId > ISNULL(CASE WHEN c.BuyerId = :me THEN c.BuyerLastReadMessageId ELSE c.SellerLastReadMessageId END, 0)) AS Unread
            FROM dbo.Conversations c
            JOIN dbo.Products p ON p.ProductId = c.ProductId
            JOIN dbo.Users b ON b.UserId = c.BuyerId
            JOIN dbo.Users s ON s.UserId = c.SellerId
            OUTER APPLY (SELECT TOP(1) ImageUrl FROM dbo.ProductImages WHERE ProductId = p.ProductId ORDER BY SortOrder, ImageId) im
            OUTER APPLY (SELECT TOP(1) MessageId, SenderId, Body, CreatedAt FROM dbo.ConversationMessages
                         WHERE ConversationId = c.ConversationId ORDER BY MessageId DESC) lm
            """;

    private static final String MESSAGE_SQL = "SELECT m.MessageId, m.SenderId, m.Body, m.CreatedAt FROM dbo.ConversationMessages m";

    private static ChatDtos.Conversation summary(ResultSet rs, int me) throws SQLException {
        boolean buyer = rs.getInt("BuyerId") == me;
        String prefix = buyer ? "Seller" : "Buyer";
        ChatDtos.Message last = rs.getObject("LastId") == null ? null : new ChatDtos.Message(rs.getLong("LastId"), rs.getInt("LastSender"),
                rs.getString("LastBody"), utc(rs, "LastAt"), rs.getInt("LastSender") == me);
        return new ChatDtos.Conversation(rs.getInt("ConversationId"), listing(rs), buyer ? "BUYER" : "SELLER",
                new AdminDtos.Ref(rs.getInt(prefix + "Id"), rs.getString(prefix + "Name")), "Active".equals(rs.getString(prefix + "Status")),
                last, rs.getInt("Unread"), utc(rs, "CreatedAt"), utc(rs, "LastMessageAt"));
    }

    private static ChatDtos.ListingRef listing(ResultSet rs) throws SQLException {
        String image = rs.getString("ImageUrl");
        return new ChatDtos.ListingRef(rs.getInt("ProductId"), rs.getString("Title"), rs.getBigDecimal("Price").longValue(),
                OrderValues.upper(rs.getString("ProductStatus")), image == null ? null : ProductMapper.publicUrl(image));
    }

    private static ChatDtos.Message message(ResultSet rs, Integer me) throws SQLException {
        return new ChatDtos.Message(rs.getLong("MessageId"), rs.getInt("SenderId"), rs.getString("Body"), utc(rs, "CreatedAt"),
                me == null ? null : rs.getInt("SenderId") == me);
    }

    private static Instant utc(ResultSet rs, String column) throws SQLException {
        LocalDateTime value = rs.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private static ApiException notFound() {
        return new ApiException(ErrorCode.NOT_FOUND, "Conversation not found.");
    }
}
