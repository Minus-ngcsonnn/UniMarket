# V002 – Multi-item orders and business rules D1–D6

Written for: the backend developers and the database owner who review and apply migration V002.

Status: **APPLIED to `UniMarketJava` on 2026-11-02 10:43 UTC** (after explicit approval), following a verified FULL
backup (`UniMarketJava_FULL_pre_V002_20261102.bak`, restored to a temporary database and checked with DBCC CHECKDB).
Pre- and post-migration checks passed; order count and all money totals are unchanged. Recorded in `dbo.SchemaMigrations`.

Throughout this document, **database** means behaviour enforced by V002 itself (tables, constraints, procedures,
triggers). **Backend (later)** means work for the Spring Boot API in a later stage; nothing of it exists yet.

## 1. Approved model

- One **order** = one buyer + one seller + one or more listings **from that seller**.
- One **checkout** may contain listings from several sellers → **one order per seller**, created together.
- Checkout is **all-or-nothing**: if one listing is unavailable, nothing is created or reserved.
- Each order has its own delivery details, delivery fee, payment, delivery record, settlement, status history,
  reviews and disputes.

## 2. Final business decisions

| # | Decision (final) | Where it lives |
|---|---|---|
| **D1** | The buyer pays the delivery fee online with the order. The seller arranges delivery and receives the **whole** delivery fee in the settlement. No commission on delivery fees. | `Orders.ShippingFee`, `TotalAmount`, `SellerPayoutTotal`; `SellerSettlements.ShippingFee`, `Amount` |
| **D2** | After the seller confirms, the buyer has **24 hours** to pay. Unpaid orders past the deadline expire and release every item. | `Orders.PaymentDueAt`; `usp_StartPayment`, `usp_RecordPaymentResult`, `usp_ExpirePendingOrders` |
| **D3** | Refunds and disputes are handled **manually by an admin**. No automatic refunds. | `OrderDisputes`; `usp_OpenOrderDispute`, `usp_ResolveOrderDispute`, `usp_ConfirmDisputeRefund`; `AdminActions` |
| **D4** | **3 %** commission on the merchandise subtotal of completed orders, deducted from the seller's merchandise proceeds. Shipping fees excluded. No exemption: it also applies in the MVP/demo phase, where transactions only simulate the money flow (no real money). Standard listings stay free. **Officially approved by the team on 2026-11-02.** | `Orders.CommissionRate` (CHECK = 0.03), `CommissionAmount`; `SellerSettlements.CommissionAmount` (CHECK) |
| **D5** | Buyer and seller review each other **once per completed order** (not per item). | `Reviews` + `trg_Reviews_Validate` + `UNIQUE (OrderId, ReviewerId)` – unchanged from V001 |
| **D6** | A settlement is **calculated** at completion; an **admin confirms the payout** manually, with a transfer reference. No automatic payouts. | `SellerSettlements` (+ breakdown and audit columns), `usp_CompleteOrder`, `usp_MarkSettlementReleased`, `trg_SellerSettlements_Guard` |

## 3. Money (D1, D4)

For every order, all amounts are `decimal(18,0)` (whole VND), computed by SQL Server, never `float`:

| Value | Formula | Column |
|---|---|---|
| Merchandise subtotal | sum of item prices at purchase time | `Orders.Subtotal` (stored) |
| Delivery fee | amount given at checkout | `Orders.ShippingFee` (stored) |
| Charged to the buyer | Subtotal + ShippingFee | `Orders.TotalAmount` (computed) |
| Commission | `ROUND(Subtotal × 0.03, 0)` | `Orders.CommissionAmount` (computed) |
| Seller merchandise proceeds | Subtotal − Commission | `Orders.SellerProceeds` (computed) — **merchandise only** |
| Seller payout | SellerProceeds + ShippingFee | `Orders.SellerPayoutTotal` (computed) — **what the seller is owed** |

Example (verified by test F01–F03):

| Subtotal | Delivery fee | Buyer pays | Commission 3 % | Proceeds | Seller payout |
|---|---|---|---|---|---|
| 500 000 | 25 000 | 525 000 | 15 000 | 485 000 | 510 000 |

Rounding: `ROUND(333 333 × 0.03, 0)` = `ROUND(9 999.99)` = 10 000 (test F16). `ROUND` rounds half away from zero.

The delivery fee is **not a shipping quote**: UniMarket has no delivery-service integration. `usp_Checkout` takes
`@ShippingFee` as an explicitly provided amount and applies it to **each** order created by that checkout
(default 0). *Backend (later)*: decide where the amount comes from (seller-set fee or a configured value) and show
it before payment (Business Plan: "delivery costs must be disclosed before payment").

## 4. Order and listing state rules

| Event | Order | Listings |
|---|---|---|
| Checkout (`usp_Checkout`) | `Pending`, `ConfirmBy = placement + 24 h` (Business Plan 3.4: seller confirms within 24 hours; V001 default, unchanged) | `Available → Reserved`, removed from buyer's cart |
| Seller confirms (`usp_ConfirmOrder`) | `AwaitingPayment`, `PaymentDueAt = ConfirmedAt + 24 h` | stay `Reserved` |
| Seller declines / buyer cancels / admin cancels before payment (`usp_CancelOrder`) | `Cancelled` | all `Reserved → Available` |
| Not confirmed within 24 h (`usp_ExpirePendingOrders`) | `Cancelled` — "Confirmation deadline exceeded" | all `Reserved → Available` |
| Not paid within 24 h of confirmation (`usp_ExpirePendingOrders`) | `Cancelled` — "Payment deadline exceeded" | all `Reserved → Available` |
| Payment verified (`usp_RecordPaymentResult`) | `Paid` | stay `Reserved` |
| Seller ships (`usp_ShipOrder`, courier/tracking optional) | `Delivering` | stay `Reserved` |
| Buyer confirms receipt (`usp_CompleteOrder`) | `Completed` + settlement **Pending** | all `Sold` |
| Cancel a paid order | **rejected (51018)** — use a dispute (D3) | stay `Reserved` |

The two 24-hour windows are independent: the **seller window** (`ConfirmBy`, from placement) only applies to
`Pending` orders and `usp_ConfirmOrder` refuses after it even before the expiry job runs (51007); the **buyer
payment window** (`PaymentDueAt`, from confirmation) only applies to `AwaitingPayment` orders. A seller who
confirms at hour 23 still gives the buyer a full 24 hours (test C06). Requirement-by-requirement mapping to the
Business Plan: `BUSINESS_PLAN_TRACEABILITY.md`.

`usp_ExpirePendingOrders` must be scheduled by the backend (e.g. every minute). *Backend (later).*

## 5. Payment deadline (D2)

1. `PaymentDueAt` is a persisted computed column `DATEADD(hour, 24, ConfirmedAt)` (UTC, `SYSUTCDATETIME()`).
   It is `NULL` until the seller confirms, so the 24 hours start at confirmation, not at checkout.
2. `usp_StartPayment` refuses new attempts at or after `PaymentDueAt` (51024).
3. **Late payment callback (approved 2026-11-02).** A success that arrives after `PaymentDueAt` is accepted only if
   the attempt was **started before** `PaymentDueAt` (recorded by `usp_StartPayment`, 51025 otherwise) **and** the
   answer arrives within a **30-minute grace window** after `PaymentDueAt` (51026 otherwise).
4. `usp_ExpirePendingOrders` cancels `AwaitingPayment` orders past `PaymentDueAt`. An order with an attempt still
   `Pending` is only spared **inside the grace window**; after it, the order expires anyway, its items are released
   and the unanswered attempt is closed as `Expired` (UniMarket stopped waiting – this is not a provider result).
   A provider success for an `Expired` attempt is rejected (51026): the backend must alert an admin, who refunds
   the buyer manually (D3). So a silent provider can never block expiry or keep items reserved indefinitely.
   Paid, Delivering and Completed orders are never touched.
5. **What the callback must prove.** The *backend (later)* authenticates the callback (provider signature, provider
   order id = our `RequestKey`) before calling the procedure – the database cannot verify signatures. The database
   then checks: the attempt exists and belongs to the order; `@Provider` (when passed) equals the attempt's
   provider; the amount equals `Orders.TotalAmount`; a provider reference is present and unique per provider
   (`UX_PaymentReference`); at most one successful and one pending attempt per order (`UX_SuccessfulPayment`,
   `UX_PendingPayment`); an identical repeated callback is ignored and a conflicting one rejected (51011).
6. Concurrency: expiry locks the candidate order rows first (`UPDLOCK, HOLDLOCK`) and only then looks at payments;
   payment recording and payment start lock the same order row. Verified with two real sessions:
   - payment success recorded while expiry runs → expiry waits, order ends **Paid**, items Reserved;
   - expiry runs while the buyer starts paying → payment start waits, then fails (51008); order Cancelled,
     items Available, no payment row;
   - expiry closes an unanswered attempt beyond grace while the provider's success arrives → the callback waits,
     then fails (51026); order Cancelled, attempt Expired, items Available.

The 30-minute grace window is a fixed value in `usp_ExpirePendingOrders` and `usp_RecordPaymentResult`. It should
be longer than the payment session lifetime configured with MoMo / ZaloPay; change both places together if needed.

Existing demo orders: `PaymentDueAt` is derived from their recorded `ConfirmedAt`. Demo orders 9 and 10
(`AwaitingPayment`, confirmed when V001 was installed) will expire at the first expiry run after their deadline.

## 6. Refunds and disputes (D3) – manual, admin only

What the database does:

- `OrderDisputes` records one dispute per request: who opened it, reason, status (`Open` / `Resolved`), the admin's
  decision (`NoRefund` / `RefundApproved`), resolution text, who decided and when.
- `usp_OpenOrderDispute`: only the buyer or seller of a **paid** order (`Paid`, `Delivering`, `Completed`) can open
  one; one open dispute per order (also a filtered unique index); not after the seller has been paid out.
- `usp_ResolveOrderDispute`: only an active admin; records the decision and an `AdminActions` row.
- `RefundApproved` is **a decision only**: order status, listings, payment and settlement do not change.
- `usp_ConfirmDisputeRefund`: an admin records that the refund **really happened outside UniMarket** (provider
  dashboard or manual transfer), with its reference. CHECK constraints make a "refund done" impossible without an
  approved refund, a reference, an admin and a timestamp.
- While a dispute is open, or after a refund was approved, the seller payout is on hold (51042).

What stays manual / later: contacting the parties, the actual refund in the payment provider, and any change of the
order or listing afterwards (e.g. relisting a returned item). *Backend (later)*: admin screens and API for these
procedures. No provider refund API is called anywhere.

## 7. Reviews (D5) – unchanged from V001

`Reviews` (one row per reviewer per order) + `UNIQUE (OrderId, ReviewerId)` + `trg_Reviews_Validate`:

- only after the order is `Completed`;
- only the order's buyer → seller, or seller → buyer;
- each direction once per order (duplicate → 2627);
- one review per order regardless of how many items it has.

Verified by tests V01–V04 and T22a/b. No per-item reviews are added.

## 8. Settlements and payouts (D6)

| Step | What happens | Status |
|---|---|---|
| Order completed | `usp_CompleteOrder` creates **one** settlement: `MerchandiseSubtotal`, `CommissionAmount`, `ShippingFee`, `Amount = subtotal − commission + fee` | `Pending` = **calculated**, money owed, **not paid** |
| Admin pays the seller outside UniMarket | (manual bank / e-wallet transfer) | – |
| Admin confirms | `usp_MarkSettlementReleased @AdminId, @PayoutReference [, @Note]` stores who, when and the transfer reference, plus an `AdminActions` row | `Released` = **admin-confirmed payout** |

Guards (`trg_SellerSettlements_Guard` + CHECK constraints), effective even for SQL that bypasses the procedures:

- a settlement can only be created as `Pending`, for a `Completed` order of that seller, with exactly the order's
  subtotal, commission and delivery fee (51043); one per order (primary key);
- commission must be 3 % of the subtotal and `Amount` must equal the breakdown (CHECK);
- amounts never change; a `Released` settlement is final (51044);
- `Released` requires an active admin and a non-empty payout reference (51045).

`Released` means "an admin says the transfer was made, reference X". The database does **not** move money and
cannot prove the transfer; the reference is there so it can be checked against the bank / wallet statement.

**Historical settlements (approved 2026-11-02).** The 4 settlements created by V001 (orders 1–4) keep their
**original financial treatment**: they were calculated as merchandise proceeds only, without the delivery fee.
V002 does **not** rewrite them – `Amount`, status and dates stay exactly as recorded (order 4 stays **92 150 VND**,
`Pending`). Their new breakdown columns are filled in truthfully with `ShippingFee = 0` (= no delivery fee paid
out), so the CHECK `Amount = subtotal − commission + fee` holds without changing any amount. Orders 1–3 are
`Released` without admin/reference because V001 recorded no payout audit. **Every order completed after V002**
follows D1: payout = merchandise proceeds + delivery fee.

## 9. Schema changes in V002

### New

| Object | Purpose |
|---|---|
| `OrderItems` | Items of an order: `ProductId`, `ProductTitle` + `UnitPrice` snapshots, `Quantity` = 1, `SellerId` |
| FKs `(OrderId, SellerId)` → `Orders`, `(ProductId, SellerId)` → `Products` | item seller = order seller = listing seller |
| `UQ_Orders_Order_Seller`, `UQ_Products_Product_Seller` | keys for the two composite FKs |
| `vw_ActiveOrderItems` + unique index on `ProductId` | a listing in at most one non-cancelled order (replaces `UX_ProductOccupied`) |
| `ProductIdList` table type, `usp_Checkout` | whole checkout (replaces `usp_PlaceOrder`) |
| `OrderDisputes` + `UX_OrderDisputes_OneOpen` | D3 |
| `usp_OpenOrderDispute`, `usp_ResolveOrderDispute`, `usp_ConfirmDisputeRefund` | D3 |
| `trg_SellerSettlements_Guard` | D4/D6 guards |
| `SchemaMigrations` | applied versions |

### Changed

| Object | Change |
|---|---|
| `Orders` | + `Subtotal`; − `ProductId`, `ProductTitle`, `ItemPrice`; computed `TotalAmount`, `CommissionAmount`, `SellerProceeds` now from `Subtotal`; + computed `PaymentDueAt`, `SellerPayoutTotal`; `PaymentProvider` optional until paid (CHECK) |
| `SellerSettlements` | + `MerchandiseSubtotal`, `CommissionAmount`, `ShippingFee` (NOT NULL, CHECKed), + `ReleasedBy` (FK Users), `PayoutReference`, `PayoutNote` |
| `Deliveries` | `Carrier`, `TrackingNumber` optional |
| `usp_StartPayment` | optional `@Provider`; deadline check (51024) |
| `usp_RecordPaymentResult` | optional `@Provider` check; late success only for attempts started before the deadline (51025) and within the 30-minute grace (51026); `Expired` attempts rejected (51026) |
| `Payments` | `Status` may also be `Expired` (attempt abandoned after the grace window) |
| `usp_ShipOrder` | courier / tracking optional |
| `usp_CompleteOrder` | all items Sold; settlement with breakdown, payout incl. delivery fee |
| `usp_CancelOrder` | releases all items |
| `usp_ExpirePendingOrders` | confirmation **and** payment timeouts; spares in-flight payments only inside the 30-minute grace window, then marks them `Expired`; returns expired orders |
| `usp_MarkSettlementReleased` | **new signature** `(@OrderId, @AdminId, @PayoutReference, @Note = NULL)`; admin + reference; dispute hold |
| `vw_AdminDashboard` | refreshed only |

Unchanged: `usp_ConfirmOrder`, `usp_VerifyEmail`, `trg_Reviews_Validate`, `trg_Cart_Validate`, `vw_ProductCatalog`,
`vw_PublicProfiles`, `vw_UserRatings`, all other tables. Full schema: `../schema/SCHEMA_REFERENCE_after_V002.md`.

New error numbers: 51020 empty checkout · 51021 listing unavailable · 51022 own listing · 51023 no payment provider ·
51024 payment deadline passed · 51025 attempt started after deadline · 51026 payment result too late / attempt expired (refund manually) · 51030–51033 opening a dispute ·
51034–51038 resolving / refund confirmation · 51040–51042 payout confirmation · 51043–51045 settlement guards.

## 10. Demo data migration

Each of the 12 V001 orders becomes **one order with one item** (`OrderId`, prices, titles, statuses and dates kept;
orders are not merged). Payments, deliveries, settlements (amounts and statuses), reviews and history are untouched;
settlements only gain their breakdown columns. The migration compares every order with a snapshot and the related
tables with checksums before it commits.

| | Before | After (verified on copy) |
|---|---|---|
| Orders / items | 12 / – | 12 / 12 |
| Merchandise / shipping / charged | 1 290 000 / 240 000 / 1 530 000 | same |
| Commission / proceeds | 38 700 / 1 251 300 | same |
| Payments / deliveries / settlements / reviews / history | 10 / 6 / 4 / 8 / 41 | same |

Why constraints are dropped: `ItemPrice` feeds three computed columns and a CHECK; `ProductId` has an FK and
`UX_ProductOccupied`. They are dropped **inside the same transaction**, only after the data is copied into
`OrderItems` and the replacement constraints exist. Any failure rolls everything back (tested by planting a
conflicting object: the copy was left byte-for-byte as before).

## 11. Tests (all on disposable copies)

`tests/run_v002_tests.ps1` runs, on a fresh COPY_ONLY copy: pre-checks → migration → post-checks → second run
(must refuse) → 29 order scenarios → 49 D1–D6 checks → 9 seller-confirmation checks (Business Plan 3.4) →
24 concurrency checks (6 two-session races); then a
half-way failure on a second copy; then proves the source database is unchanged.

## 12. Applying V002 to `UniMarketJava` (after approval)

1. Stop the backend.
2. Full backup (the database has never been backed up) and verify it:
   ```sql
   BACKUP DATABASE UniMarketJava TO DISK = N'<backup folder>\UniMarketJava_full_pre_V002.bak' WITH CHECKSUM, INIT;
   RESTORE VERIFYONLY FROM DISK = N'<backup folder>\UniMarketJava_full_pre_V002.bak' WITH CHECKSUM;
   ```
   Optionally prove restore viability by restoring it under another name (`tests/create_test_copy.sql` pattern).
3. `validation\V002_pre_migration_checks.sql` → all PASS (backup row INFO); keep the INFO rows.
4. `sqlcmd -S <server> -E -C -I -b -d UniMarketJava -i migrations\V002__multi_item_orders.sql`
   → `V002 applied and verified: 12 orders, 12 order items.`
5. `validation\V002_post_migration_checks.sql` → all PASS; totals equal step 3.
6. Regenerate `schema\SCHEMA_REFERENCE_after_V002.md` from the live database.
7. Backend: `mvnw test` with `UNIMARKET_DB_IT=true`, start the API, `GET /api/health` → `database: UP`.

Rollback: a failed run leaves V001 intact. After a successful commit, going back means restoring the step-2 backup.

## 13. Open points (not blocking V002)

- **Delivery fee source** (seller-set or configured) and its display before payment – backend/frontend.
- **Payment session lifetime** with MoMo / ZaloPay must be shorter than the 30-minute grace window (§5).
- **Late-charge alerts**: when the backend gets 51026 for a successful charge it must alert an admin (no database
  record is created for a rejected callback).
