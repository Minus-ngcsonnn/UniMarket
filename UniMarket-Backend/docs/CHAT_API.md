# Chat API (V004)

Buyer / seller chat about a listing, and reports about a conversation. Signed-in users only; identity always comes
from the token. Errors use the common `ApiErrorResponse` (`code`, `message`, `fieldErrors[]`). Times are ISO-8601 UTC.

## Rules

- One conversation per **(listing, buyer)**. Only **student** accounts start chats, never about their own listing, and
  only about an approved listing that is `AVAILABLE` or `RESERVED`. An existing conversation stays usable after the sale.
- Only the two participants can read or write it (others get `404`).
- Messages are plain text, 1–2000 characters after trimming, at most 20 per user per minute (`429 TOO_MANY_ATTEMPTS`).
  They are never edited or deleted, so a reported chat is complete for the admin.
- Sending to a suspended / closed account: `409 CHAT_UNAVAILABLE`.
- No push channel: the frontend polls `GET .../messages?after=<last id>` (4 s) and the unread counter (15 s).

## Student endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/conversations` `{ productId }` | Opens the conversation, or returns the existing one. `409 CHAT_NOT_ALLOWED` (own / sold listing, admin account), `404` (listing not public). |
| GET | `/api/conversations` | Mine, newest activity first. Sellers only see conversations with at least one message. |
| GET | `/api/conversations/unread-count` | `{ count }` over all my conversations. |
| GET | `/api/conversations/{id}` | `{ id, listing, myRole: BUYER/SELLER, counterpart, counterpartActive, lastMessage, unreadCount, createdAt, lastMessageAt }` |
| GET | `/api/conversations/{id}/messages?after=&before=&limit=50` | Ascending. `after`: newer than that id; otherwise the newest `limit` (max 100), or older than `before`. Each message: `{ id, senderId, body, createdAt, mine }`. |
| POST | `/api/conversations/{id}/messages` `{ body }` | `201` with the message. Sending also marks the conversation read for the sender. |
| POST | `/api/conversations/{id}/read` | Marks every message as read by me; returns the conversation. |

## Reporting a conversation

`POST /api/reports` with `{ "targetType": "CONVERSATION", "targetId": <conversation id>, "reason": "OFF_PLATFORM_PAYMENT", "details": "..." }`.
Only a participant can report, and only after the other person has written at least one message. The report stores
`ConversationId` and the other participant as `ReportedUserId`, and goes through the normal admin flow:
`OPEN` → `REVIEWING` (`POST /api/admin/reports/{id}/review`) → `RESOLVED` / `DISMISSED`
(`POST /api/admin/reports/{id}/resolve|dismiss` with `{ resolution }`). One unhandled report per reporter and conversation
(`409 REPORT_ALREADY_OPEN`).

In report responses a conversation target is `{ type: "CONVERSATION", id: <conversation id>, label: <listing title>,
status: <reported account status>, owner: { id, name } = the reported person }` (status / owner for admins only).
`GET /api/admin/reports?targetType=CONVERSATION` lists them; `targetType=USER` no longer includes them.

## Admin endpoint

`GET /api/admin/conversations/{id}`: the conversation with both participants and **every** message. Only for
conversations that have at least one report (otherwise `404`): unreported chats stay private. Each read is recorded in
`AdminActions` (`View reported conversation`, EntityType `Conversation`).

## Tests

`ChatIntegrationTest` (needs `UNIMARKET_WRITE_IT=true` and a database whose name contains `Test`, e.g. a copy of
UniMarketJava with V004 applied).
