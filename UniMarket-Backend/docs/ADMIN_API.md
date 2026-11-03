# Admin, Reviews, Reports, Disputes, Settlements & Promotions API (Backend Stage 5)

Written for: frontend and backend developers connecting the React app to the Spring Boot API.

Errors use the common `ApiErrorResponse` (`code`, `message`, `fieldErrors[]`). Money is whole VND, times are ISO-8601
UTC. Pages are `{ items, page, size, totalItems, totalPages }` (1-based, `size` ≤ 100 for admin lists).
No schema change was made: everything uses V001 + V002 tables, views, triggers and procedures.

## Authorization

| Paths | Who |
|---|---|
| `/api/admin/**` | `Users.Role = 'Admin'` only (`SecurityConfig`): 401 without token, **403 for students** |
| `GET /api/users/{id}`, `/ratings`, `/reviews`, `GET /api/promotion-packages` | public |
| everything else below | signed in; the acting user always comes from the token |

The acting admin is taken from the token and re-checked by the V002 procedures (active admin). Every admin change
writes `dbo.AdminActions` (Action / EntityType / EntityId / Reason), following the existing demo naming.

---

## 1. Listing moderation (pre-moderation)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/admin/listings?moderation=PENDING\|APPROVED\|BLOCKED\|ALL&q=&page=&size=` | | queue (PENDING oldest first) |
| GET | `/api/admin/listings/counts` | | `{PENDING, APPROVED, BLOCKED}` |
| GET | `/api/admin/listings/{id}` | | listing + `description`, `images`, `version`, `openReports`, `history` |
| POST | `/api/admin/listings/{id}/approve` | `{ "version": "…", "note": "…"? }` | PENDING → APPROVED |
| POST | `/api/admin/listings/{id}/reject` | `{ "version": "…", "reason": "10–1000 chars" }` | PENDING → BLOCKED |
| POST | `/api/admin/listings/{id}/block` | `{ "reason": "…" }` | APPROVED → BLOCKED (hidden) |
| POST | `/api/admin/listings/{id}/remove` | `{ "reason": "…" }` | Draft/Available → REMOVED (soft) |
| GET | `/api/me/products/{id}/moderation` | (seller) | `[{ action, reason, at }]` without admin identity |

- Moderation `PENDING / APPROVED / BLOCKED` = SQL `Pending / Approved / Rejected`; sale `status` is separate.
- **Stale approval protection:** `version` is the hex `Products.Version` (rowversion) shown in the detail. Approve /
  reject apply only to that version. If the seller edited the listing meanwhile (which also puts it back to
  PENDING), the answer is **409 `LISTING_CHANGED`**: reload and review the new version.
- **Approval never makes a listing purchasable by itself:** only Draft/Available listings can be approved (409
  `MODERATION_CONFLICT` for Reserved, Sold, Removed); buying still requires Available + Approved.
- Blocking a listing that is already in an order hides it but does not change the order. Reserved/Sold listings
  cannot be removed. Rows are never deleted.
- Two admins approving at once: one 200, the other 409; one audit row.
- Existing demo listings are not touched (no automatic approval).

Flow: seller `POST /api/products` (Stage 3, PENDING) → admin `GET /api/admin/listings/{id}` → `approve` with its
`version` → listing public (`GET /api/products/{id}`), in the catalog, purchasable.

## 2. Accounts

| Method | Path | Body |
|---|---|---|
| GET | `/api/admin/users?q=&status=ACTIVE\|SUSPENDED\|CLOSED&role=STUDENT\|ADMIN\|ALL&page=&size=` | |
| GET | `/api/admin/users/{id}` | |
| POST | `/api/admin/users/{id}/contact-access` | `{ "purpose": "10–1000 chars" }` → `{ userId, phone, zaloUrl, showContact }` |
| POST | `/api/admin/users/{id}/suspend` | `{ "reason": "10–1000 chars" }` |
| POST | `/api/admin/users/{id}/reactivate` | `{ "reason": "…" }` optional |

- Response: id, email, name, role, status, `emailVerified`, campus, createdAt, listing/order counts, rating, open
  reports; detail adds `showContact`, the admin action history and phone/Zalo **only when the user shares them**.
  **Never** password hashes, codes, tokens.
- **Private contact** (`ShowContact = false`): only through `POST …/contact-access` with a purpose (support,
  moderation, dispute). Every access writes `AdminActions` ("View private contact", EntityType `User`, the purpose)
  and shows in the history as `PRIVATE_CONTACT_VIEWED`. Public endpoints never return private contact.
- `emailVerified` only means the email address was confirmed with a code. It is **not** a student status (team
  decision, Nov 2026: registration with any email + OTP; no student-ID / FAP / SSO / manual approval).
- Only Active **students** can be suspended (409 `ACCOUNT_STATE_CONFLICT` for admins, yourself, or already suspended).
- Effect: the next request with that account's token gets **401** (Stage 2 re-checks `Users.Status`), its listings
  leave the catalog, it cannot check out. Orders, payments, settlements and reviews are kept.
- No endpoint changes a role; registration always creates a Student (a `role` field in the request is ignored).

## 3. Orders (read only for admins)

`GET /api/admin/orders?status=&page=&size=` and `GET /api/admin/orders/{id}`: the Stage 4 order view with
`role: "ADMIN"` (all amounts, delivery, payments, settlement), `actions: []`.

## 4. Reviews and ratings (D5)

| Method | Path | Who |
|---|---|---|
| POST | `/api/orders/{orderId}/reviews` `{ "rating": 1–5, "comment": "≤ 500"? }` | buyer or seller of the order → 201 |
| GET | `/api/orders/{orderId}/reviews` | participants → `{ canReview, mine, theirs }` |
| GET | `/api/users/{userId}/ratings` | public → `{ userId, average, count, distribution{"1".."5"}, asSeller, asBuyer }` |
| GET | `/api/users/{userId}/reviews?role=SELLER\|BUYER&page=&size=` | public (visible reviews) |
| GET | `/api/users/{userId}` | public profile: name, campus, `emailVerified`, memberSince, rating, active listings, `contact` only when shared |

- Only after the order is COMPLETED (409 `REVIEW_NOT_ALLOWED`), once per direction (409 `ALREADY_REVIEWED`),
  strangers 404. The reviewee is the other side of the order — never taken from the request.
- `direction`: `BUYER_TO_SELLER` / `SELLER_TO_BUYER`. Averages come from `vw_UserRatings` (hidden reviews excluded).
- No edit/delete endpoints (no approved policy).

## 5. Reports (listings / accounts) — not disputes

| Method | Path | Body |
|---|---|---|
| POST | `/api/reports` | `{ "targetType": "LISTING"\|"USER", "targetId": 12, "reason": "OFF_PLATFORM_PAYMENT", "details": "≤ 500"? }` → 201 |
| GET | `/api/me/reports` | my reports |
| GET | `/api/admin/reports?status=ACTIVE\|OPEN\|REVIEWING\|RESOLVED\|DISMISSED\|ALL&targetType=` | |
| GET | `/api/admin/reports/{id}` | |
| POST | `/api/admin/reports/{id}/review` | Open → REVIEWING |
| POST | `/api/admin/reports/{id}/resolve` / `/dismiss` | `{ "resolution": "10–2000 chars" }` → RESOLVED / DISMISSED (final) |

- Reason codes = frontend `REPORT_REASONS` (MISLEADING, PROHIBITED, OFF_PLATFORM_PAYMENT, FAKE, HARASSMENT, SPAM,
  OTHER; validated server-side). `Reports.Reason` is `nvarchar(2000)`; it is stored as `"CODE"` or `"CODE: details"`
  (details ≤ 500, so ≤ ~522 characters). Parsing takes only the text before the FIRST colon as a code candidate and
  accepts only the known codes, so colons inside the details are safe; older rows without a code are shown as
  `OTHER` with the whole text. Details are returned as plain text (the frontend must render them as text, never
  HTML). Limitation: analytics per reason need `LIKE 'CODE%'`; a separate `ReasonCode` column would need V003.
- Public listings and student accounts only; not your own listing / yourself (400); one unhandled report per
  reporter and target (409 `REPORT_ALREADY_OPEN`).
- A second decision is refused (409 `REPORT_STATE_CONFLICT`). A decision is a record only: blocking a listing or
  suspending an account are separate admin actions.

## 6. Order disputes (D3)

Opening: `POST /api/orders/{id}/disputes` (Stage 4, buyer or seller of a PAID / DELIVERING / COMPLETED order).

| Method | Path | Body |
|---|---|---|
| GET | `/api/me/disputes` | disputes of my orders (either side) |
| GET | `/api/admin/disputes?status=OPEN\|RESOLVED\|ALL` / `/api/admin/disputes/{id}` | |
| POST | `/api/admin/disputes/{id}/resolve` | `{ "decision": "NO_REFUND"\|"REFUND_APPROVED", "resolution": "…" }` (`usp_ResolveOrderDispute`) |
| POST | `/api/admin/disputes/{id}/confirm-refund` | `{ "refundReference": "…" }` (`usp_ConfirmDisputeRefund`) |

- **No refund is ever executed.** `REFUND_APPROVED` is a decision; order, listings and payment are unchanged.
  `confirm-refund` records the reference of a refund an admin made **outside UniMarket** (once, only after
  REFUND_APPROVED). For sandbox orders (`sandbox: true`) no real money exists.
- While a dispute is open the buyer cannot confirm receipt (Stage 4); while it is open or a refund was approved the
  payout cannot be released (`SETTLEMENT_ON_HOLD`). A second resolution is refused (409 `DISPUTE_STATE_CONFLICT`).

## 7. Seller settlements (D1, D4, D6)

| Method | Path | Body |
|---|---|---|
| GET | `/api/admin/settlements?status=PENDING\|RELEASED\|ALL&onHold=true\|false` | |
| GET | `/api/admin/settlements/{orderId}` | |
| POST | `/api/admin/settlements/{orderId}/release` | `{ "payoutReference": "≤ 100", "note": "≤ 400"?, "acknowledgeSimulated": true }` (`usp_MarkSettlementReleased`) |

- Created once by `usp_CompleteOrder` (V002): `amount = merchandiseSubtotal − commission (3 %) + shippingFee`.
  Shown exactly as stored; V001 historical settlements (orders 1–4, `shippingFee = 0`) are never recalculated.
- `release` records that the seller was paid **outside UniMarket**, with the transfer reference; it moves no money.
  Once only (409 `SETTLEMENT_STATE_CONFLICT`), not while on hold (409 `SETTLEMENT_ON_HOLD`), admins only (also
  enforced by `trg_SellerSettlements_Guard`).
- **Sandbox safety.** `SellerSettlements.IsSandbox` is copied from the order's payment by `usp_CompleteOrder` and the
  trigger forbids changing it, so simulated and real settlements are reliably distinguishable. Releasing a sandbox
  settlement requires `"acknowledgeSimulated": true` (400 otherwise); the stored note starts with
  `[SANDBOX] Simulated payout record - no money was transferred.`, which `usp_MarkSettlementReleased` also writes into
  the `AdminActions` reason. Released settlements carry `payoutRecordType`: `SIMULATED_RECORD` (sandbox) or
  `EXTERNAL_TRANSFER_CONFIRMED` (real transfer made outside UniMarket). The dashboard never adds the two together.

## 8. Promotions (Business Plan 4.1.2)

| Method | Path | Who |
|---|---|---|
| GET | `/api/promotion-packages` | public: `[{ id, name, durationHours, price }]` from `PromotionPackages` (5 000 / 15 000 / 30 000 VND) |
| POST | `/api/products/{id}/promotions` `{ "packageId": 2, "provider": "MOMO"\|"ZALOPAY" }` | seller of the listing → 201 (200 + `resumed` if one is pending) |
| GET | `/api/me/products/{id}/promotions`, `/api/me/promotions` | seller |
| POST | `/api/dev/payment-simulator/promotions/{promotionId}/complete` `{ "outcome": "SUCCESS"\|"FAILURE" }` | seller, **sandbox only** |

- Standard listings stay free. Amount and duration come from the package; the request only chooses it.
- Only an Approved + Available listing of the signed-in seller (others: 404; not eligible: 409
  `PROMOTION_NOT_ALLOWED`). One at a time: not while another is pending or active.
- **Concurrency.** Starting locks the listing row (`UPDLOCK, HOLDLOCK`) before checking for a pending or active
  promotion, so two simultaneous requests serialize: one creates the promotion (201), the other resumes it (200).
  Recording a payment locks the promotion row, so a replayed notification is `DUPLICATE_IGNORED`. Tested with real
  concurrent HTTP calls. Remaining risk: there is **no database constraint** (e.g. a filtered unique index on
  `ProductId WHERE Status = 'Pending'`); code that writes `ProductPromotions` outside `PromotionService` could still
  create overlaps. Proposed in the V003 list; not created.
- Starting does **not** feature the listing. It becomes PAID — and `featured` — only through a signed provider
  notification (the Stage 4 HMAC simulator path, `X-Simulator-Signature`; amount must equal the stored package price;
  identical repeats ignored, conflicting ones 409). The window starts at payment (truncated to the second) and lasts
  the package duration; if another promotion of the listing were still active, it starts when that one ends.
- Promotion payments use `ProductPromotions`' own columns (Provider, RequestKey, ProviderReference, IsSandbox) —
  never the order `Payments` table or order procedures. Expiry needs no job: `featured` = Paid and now within
  `[startsAt, endsAt)`. Response: `{ id, productId, promotionPackage, amount, provider, status, active, startsAt,
  endsAt, sandbox, simulatorUrl? }`; the request key is never returned.

## 9. Dashboard

`GET /api/admin/dashboard?from=2026-11-01&to=2026-11-30` (UTC days, inclusive; both optional) and
`GET /api/admin/badges` → `{ pendingListings, openReports, openDisputes, pendingSettlements }`.

| Part | Content |
|---|---|
| `users` | students, admins, activeStudents, suspended, closed, studentAccountsWithEmailVerified (email ownership, not enrolment), newStudentsInPeriod |
| `listings` | publicAvailable, pendingModeration, blocked, reserved, sold, removed, draft |
| `orders` | count per status, placedInPeriod |
| `finance` (completed in period) | completedOrders, **grossMerchandiseValue** (Σ Subtotal), **shippingFees**, **buyerPaidTotal** (= GMV + shipping), **commissionRevenue** (Σ 3 % commission = platform revenue), sellerPayoutTotal, sandboxOrders |
| `settlements` | pendingCount, pendingAmount, pendingSandboxAmount, onHoldCount, releasedInPeriodCount, **releasedRealAmountInPeriod** (admin-confirmed real transfers) and **releasedSandboxAmountInPeriod** (simulated records — never cash disbursed) |
| `disputes` | open, refundApprovedAwaitingConfirmation |
| `reports` | open, reviewing |
| `promotions` | activePaid (now), paidInPeriod, paidRevenueInPeriod, sandboxPaidInPeriod |

Money is aggregated from `Orders` rows only (no join with `OrderItems`), so multi-item orders are counted once. Buyer
total is never reported as revenue, and shipping is never commission. Empty periods return zeros. All figures are
real database values; `sandboxOrders` / `sandboxPaidInPeriod` show how many come from simulated payments.

## 10. Contact settings

`GET /api/me/contact` and `PUT /api/me/contact` `{ "phone": "0912 345 678"?, "zaloUrl": "https://zalo.me/…"?,
"showContact": true }`. Own account only. Phone: Vietnamese mobile (stored without spaces); Zalo: `https://zalo.me/…`;
sharing needs at least one. The sharing rule is unchanged: phone/Zalo appear on listings and the public profile only
while `showContact` is true (whether to also require a signed-in viewer is a pending decision).

## Error codes added in Stage 5

`LISTING_CHANGED`, `MODERATION_CONFLICT`, `ACCOUNT_STATE_CONFLICT`, `REVIEW_NOT_ALLOWED`, `ALREADY_REVIEWED`,
`REPORT_ALREADY_OPEN`, `REPORT_STATE_CONFLICT`, `DISPUTE_STATE_CONFLICT`, `SETTLEMENT_ON_HOLD`,
`SETTLEMENT_STATE_CONFLICT`, `PROMOTION_NOT_ALLOWED` (all 409).

## Open points

1. Decided in Nov 2026: nationwide registration with any email + OTP (no student verification); shipping to be
   carrier-quoted (not integrated). Still pending: carrier details, seller contact for signed-in viewers only,
   checkout idempotency and the nationwide campus model (both V003, see `database/docs/V003_PROPOSAL_nationwide_registration.md`).
2. Pending promotion payments have no timeout status (`ProductPromotions.Status` allows only Pending / Paid /
   Failed). With the simulator the seller finishes or fails it; a real provider would need an "Expired" status (V003
   proposal) to close abandoned attempts without inventing a provider result.
3. Rejection reasons live in `AdminActions` (no column on `Products`); category management, review hiding
   (`Reviews.IsHidden`) and notifications (`Notifications`) have no API yet.
