# Business Plan → implementation traceability (V001 + V002 + V003, Stage 7)

Written for: the team and reviewers checking that UniMarket implements the Business Plan (version of 31 October 2026,
sections 3, 4 and 6) together with the team decisions of November 2026.

State on **2026-11-04**: `UniMarketJava` has migrations **V001, V002, V003** (`dbo.SchemaMigrations`; V003 applied on
2026-11-03). Backend and frontend run every flow below against it (Stage 7 final QA). Payments and delivery fees are
**simulated** in the academic MVP: no real money moves and no carrier is contacted.

Status legend: **Done** = enforced by the database and/or backend, available in the UI and covered by tests ·
**Done (simulated)** = complete flow, with a sandbox provider instead of a real one · **Partial** = works with a
documented limitation · **Decision** = Business Plan text replaced by a team decision (see
`BUSINESS_PLAN_CHANGE_PROPOSAL_2026-11.md`) · **Future** = outside the MVP.

Tests. Database (`database/tests/`, only on `*Test` copies): `SC` = `V002_order_scenarios_test.sql` (T…),
`BR` = `V002_business_rules_D1_D6_test.sql` (F/P/R/V/E…), `CF` = `V002_seller_confirmation_test.sql` (C…),
`CC` = `V002_concurrency_test.ps1` (races 1–6), `V3` = `V003_checkout_with_shipping_tests.sql` /
`V003_financial_checks.sql`, `POST` = validation scripts. Backend (`UniMarket-Backend/src/test`): `Auth` =
`AuthIntegrationTest`, `Smtp` = `SmtpAuthFlowIntegrationTest`, `Prod` = `ProductIntegrationTest` / `ProductRulesTest`,
`Ord` = `OrderIntegrationTest` / `OrderRulesTest`, `Ship` = `ShippingRulesTest` / `V003IntegrationTest`, `Adm` =
`AdminIntegrationTest` / `AdminRulesTest`. `E2E` = Stage 7 browser walkthrough
(`UniMarket-Backend/docs/STAGE_7_DEMO_WALKTHROUGH.md`).

---

## 1. End-to-end flows as implemented

### 1.1 Registration and sign-in

1. `/register`: full name, email (any valid address), password, and affiliation: **either** an official campus
   (`GET /api/campuses`, e.g. FPT University Hoa Lac) **or** a university / college typed as free text when it is not
   listed (`Users.DeclaredUniversityName`, self-declared, not verified; campus optional — V003).
2. `POST /api/auth/register` creates the account unverified and emails a **6-digit code** (valid 10 minutes, stored
   only as a hash in `EmailVerificationTokens`; after 5 wrong tries the code is closed and a new one is needed).
3. `/verify-email` → `POST /api/auth/verify-email` sets `Users.EmailVerifiedAt`. The code can be resent.
4. `/login` → JWT access token. Unverified accounts are asked to verify; suspended accounts are refused.
5. `/forgot-password` → a 6-digit reset code by email (valid 10 minutes; the same answer for unknown emails, nothing
   sent: no account enumeration) → `POST /api/auth/reset-password`; every access token issued before the reset stops
   working.
6. Emails go through SMTP (Gmail in the official demo) or the backend log in development (`MAIL_MODE`).

### 1.2 Selling and moderation

1. `/sell`: title, description, category, condition (New / Like New / Used), price (VND), photos (saved on disk,
   metadata stripped), **pickup area** (`Products.PickupZoneId`, an approximate demo area — V003).
2. The listing starts **Pending** (pre-moderation) and is hidden from the catalog.
3. Admin `/admin/products`: approve (public and purchasable), reject with a reason, block an approved listing, or
   remove one that is not in an open order. Approval applies only to the reviewed version (`Products.Version`).
4. Editing an approved listing sends it back to Pending. The seller sees the moderation status and reason in
   `/my-listings`.

### 1.3 Buying: cart, shipping quote, checkout

1. Cart (`CartItems`) grouped by seller; only Approved + Available listings, never your own.
2. At checkout the buyer gives recipient, phone, address and a **delivery area**. `POST /api/shipping/quotes` returns,
   per seller, the distance (zone centre to zone centre × 1.3) and the options `STANDARD_SIM`, `AHAMOVE_SIM` (≤ 40 km),
   `GRAB_EXPRESS_SIM`, all labelled simulated; **free up to and including 3 km**. Each quote is signed and valid
   15 minutes.
3. The page shows items, delivery fee per seller and the total **before** the order is placed.
4. `POST /api/checkout` verifies every quote, recomputes the fee and calls `usp_CheckoutWithShipping`: one
   transaction, **one order per seller** (several items, quantity 1 each), listings become Reserved.

### 1.4 Order lifecycle

| Step | Who | Status after | Rule |
|---|---|---|---|
| Place order | buyer | `PENDING` | listings Reserved |
| Confirm availability | seller | `AWAITING_PAYMENT` | within **24 h** of the order (`ConfirmBy`) |
| Decline / cancel | seller / buyer | `CANCELLED` | only before payment; listings Available again |
| Pay online | buyer | `PAID` | within **24 h** of confirmation (`PaymentDueAt`, + 30 min grace for a payment already in progress); MoMo, ZaloPay or Bank QR, simulated; Paid only after a verified signed result |
| Ship | seller | `DELIVERING` | only after payment; carrier and tracking optional |
| Confirm receipt | buyer | `COMPLETED` | not while a dispute is open; listings Sold; settlement created |
| Expiry job | system | `CANCELLED` | `usp_ExpirePendingOrders`; **OFF in the demo** (`ORDER_EXPIRY_ENABLED=false`) |

Order pages for both sides (`/orders`, `/orders?view=sales`, `/orders/:id`) show the next action, deadlines, the
amounts and the history; they refresh every 30 s while the tab is visible.

### 1.5 Money

- Buyer pays: items subtotal + delivery fee.
- Commission: **3 % of the items subtotal only** (500 000 → 15 000), no pilot exemption (D4).
- Seller payout = subtotal − commission + delivery fee (D1: the delivery fee is passed entirely to the seller).
- At completion a `SellerSettlements` row is created `Pending`; an admin releases it on `/admin/settlements` with the
  reference of a payout made outside UniMarket (sandbox records are marked as simulated). Held while a dispute is
  open or a refund was approved.
- V001 historical settlements (orders 1–4) are kept as recorded and labelled `LEGACY_V001_MERCHANDISE_ONLY`.

### 1.6 After the sale

- **Reviews:** after `COMPLETED`, buyer reviews seller and seller reviews buyer, once each, 1–5 stars, optional
  comment (≤ 500), not editable; shown on public profiles.
- **Reports:** any signed-in student reports a public listing or a student (reason code + details); admins move them
  Open → Reviewing → Resolved / Dismissed. Blocking or suspending is a separate admin action.
- **Disputes:** buyer or seller of a `PAID`, `DELIVERING` or `COMPLETED` order opens one; an admin decides
  `NO_REFUND` or `REFUND_APPROVED` and, for an approved refund, records the reference of the refund made outside
  UniMarket. No automatic refund (D3).
- **Promotions:** the seller of an Approved + Available listing buys a package (24-hour boost 5 000, featured 3 days
  15 000, featured 7 days 30 000 VND) with a simulated payment; the listing is featured only after a verified result.

### 1.7 Administration

`/admin` dashboard (counts and simulated money shown separately from real), moderation queue, users (suspend /
reactivate), orders (read only: admins do not move buyer / seller steps), categories (read only), reports, disputes,
settlements. Every admin request is checked for the Admin role by the backend; actions are written to `AdminActions`.

---

## 2. Section 3 – Business model and process

| BP | Requirement | Implementation | Tests | Status |
|---|---|---|---|---|
| 3.1, 6.2 | Students both buy and sell with one account | `Users` (Role Student / Admin), no buyer / seller split | Auth | Done |
| 3.2 | ~~Verify with institutional email~~ | Any valid email + OTP (email ownership only); `EmailVerificationTokens` (hashed), `Users.EmailVerifiedAt`; checkout requires a verified active buyer and seller | Auth, Smtp, E2E (real Gmail) | Decision · Done |
| 3.2 | Affiliation (university / campus) | Official campus **or** self-declared university (`Users.DeclaredUniversityName`, `CampusId` nullable — V003) | Auth, Ship, E2E | Decision · Done |
| 3.2 | Listing: photos, condition, price, description, location | `Products`, `ProductImages`, `Categories`; location = campus and/or pickup area (`PickupZoneId`, `CK_Products_Location` — V003) | Prod | Done |
| 3.2, 6.7 | Contact by phone / Zalo only if the user chooses | `Users.Phone`, `ZaloUrl`, `ShowContact`; `vw_PublicProfiles`; `GET/PUT /api/me/contact` | Adm | Partial (API only, no profile edit page) |
| 3.2 | Platform moderates listings and enforces rules | Pre-moderation `Products.ModerationStatus` (Pending / Approved / Rejected = API `BLOCKED`), `AdminActions`, reports, suspension | Adm, E2E | Done |
| 3.2, 6.6 | Optional escrow: payment held until completion | Settlement created only at completion (`Pending`), released by an admin (`usp_MarkSettlementReleased`) | BR F03, F11–F15; Adm | Done (D6, simulated money) |
| 3.3 | Operations team handles disputes | `OrderDisputes`, `usp_OpenOrderDispute`, `usp_ResolveOrderDispute`, `usp_ConfirmDisputeRefund`; `/admin/disputes` | BR R01–R12; Adm; E2E | Done (D3) |
| 3.3 | Payment partners MoMo, ZaloPay | Provider CHECKs `MoMo`, `ZaloPay`, **`BankQR`** (V003) on `Orders`, `Payments`, `ProductPromotions`; all sandbox | SC T09, BR P13, Ord | Done (simulated) + Decision (Bank QR added) |
| 3.4 step 1 | Conditions New / Like New / Used | `Products.Condition` CHECK | Prod | Done |
| 3.4 step 4 | Place order with delivery address | `usp_CheckoutWithShipping` (wraps `usp_Checkout`): recipient, phone, address, delivery area | SC T02, T03, T20; V3; Ord | Done |
| 3.4 step 4 | No in-person payment, no transfer to sellers, no COD | Only online providers; no COD / transfer columns or states | – | Done |
| 3.4 step 5 | Seller confirms availability within 24 h | `Orders.ConfirmBy` = placement + 24 h; `usp_ConfirmOrder` refuses later or by anyone else; decline = `usp_CancelOrder`; expiry cancels and releases items | CF C01–C08, SC T11a, T17, T21, CC 5–6; Ord | Done (expiry job OFF in the demo) |
| 3.4 step 6 | Seller arranges delivery after payment | `usp_ShipOrder` only on `Paid`, by the seller | SC T16b; Ord; E2E | Done |
| 3.4 step 7 | Buyer confirms receipt to complete | `usp_CompleteOrder` only by the buyer, only `Delivering`, needs a successful payment, not during an open dispute | SC T16b, T16c; Ord | Done |
| 3.4 step 8 | Both parties rate each other | `Reviews`, `trg_Reviews_Validate`, `UNIQUE (OrderId, ReviewerId)` | BR V01–V04, SC T22a/b; Adm | Done (D5) |

## 3. Section 4 – Revenue model

| BP | Requirement | Implementation | Tests | Status |
|---|---|---|---|---|
| 4.1.1 | 3 % commission on completed online transactions, deducted from the seller | `Orders.CommissionRate` CHECK 0.03; `CommissionAmount`, `SellerProceeds` on the items subtotal; backend reads, never recalculates | BR F01, F03, F04, F16; SC T10; V3; POST | Done (D4) |
| 4.1.1 | Payments stay within the website checkout | All payments via `Payments` attempts and signed results; no seller transfer path | SC T09; Ord | Done (simulated) |
| 4.1.2 | Boost 24 h 5 000, featured 3 days 15 000, 7 days 30 000 | `PromotionPackages`, `ProductPromotions`, `vw_ProductCatalog.IsFeatured`; `PromotionService`, simulated payment | Adm | Done (simulated) |
| 4.1.3 | Advertising | – | – | Future |
| 4.1.4 | No subscriptions | – | – | Done (nothing to build) |
| 4.1.4, 6.4 | UniMarket earns nothing on delivery; delivery cost disclosed before payment | Simulated per-seller quote (`ShippingQuoteService`, formula `SIM-2026-11`, free ≤ 3 km), stored in `OrderShippingQuotes` (V003); shown before checkout; fee passed entirely to the seller (`SellerPayoutTotal`, settlement `ShippingFee`), no commission on it | BR F01–F04; V3; Ship; E2E | Decision · Done (simulated) |
| 4.2 | Free listing, search and contact; paid commission and promotions | No fee on listing or search | – | Done |
| 4.2, 4.2.1 | *May* waive commission during the pilot | Team decision D4 (2026-11-02): **no exemption** | BR F04 | Decision · Done |
| 4.3.4 | Provider fee ≈ 1 % (cost assumption) | Not stored (platform cost, not a transaction field) | – | Not applicable |

## 4. Section 6 – E-commerce system

| BP | Requirement | Implementation | Tests | Status |
|---|---|---|---|---|
| 6.3 | Registration / login | Section 1.1 | Auth, Smtp | Done |
| 6.3 | Cart and Buy Now | `CartItems` (+ `trg_Cart_Validate`), `/api/cart`; Buy Now = checkout with one listing | SC T08; Ord | Done |
| 6.3 | Order management and tracking for both sides | `Orders`, `OrderItems`, `OrderStatusHistory`, `Deliveries`; `/orders`, `/orders/:id`; 30 s polling | SC T02, T03; Ord; E2E | Done |
| 6.3, 6.5 | Search / filter by keyword, category, price, condition, university, campus | `vw_ProductCatalog`, `IX_ProductSearch`; `GET /api/products` filters | Prod | Partial (accent-sensitive `CI_AS`; no filter by major) |
| 6.3 | Messaging between buyer and seller | `/messages` placeholder; contact via phone / Zalo if shown | – | Future |
| 6.4 | Front-end pages (home, catalog, product, sell, cart, checkout, orders, profile, admin, information) | React routes in `UniMarket-Frontend/src/App.jsx` | E2E | Done (profile editing not implemented) |
| 6.5 | Order flow Pending → Awaiting Payment → Paid → Delivering → Completed, or Cancelled | `Orders.Status` CHECK + timestamp consistency CHECK | SC T16b, BR P05, CF C04; Ord | Done |
| 6.5 | Products Available → Reserved → Sold; sold items cannot be bought again | `Products.Status`; checkout row locks; `vw_ActiveOrderItems` unique index | SC T05, T07a/b, T16b; CC 1 | Done |
| 6.5, 6.6 | Payment request to provider; verified result updates payment and order | `usp_StartPayment`, `usp_RecordPaymentResult`; HMAC-signed simulator notifications (`PaymentSimulator`) | SC T09, T16a; BR P07–P14; CC 2, 4; Ord | Done (simulated) |
| 6.6 | Place Order → Seller Confirmation → Website Checkout → Payment | Provider chosen at payment time (`Orders.PaymentProvider` set when paid) | SC T18, T09 | Done |
| 6.5 | Orders cancelled when the transaction cannot complete | `usp_CancelOrder` (unpaid only), `usp_ExpirePendingOrders` (confirmation and payment timeouts) | SC T11a–d, T17; BR P05, P10; CF C03–C04 | Done |
| 6.5 | Admin reviews users, products, orders, reports; removes listings; restricts accounts | `Users.Status`, moderation, `Products.Status = Removed`, `Reports`, `AdminActions`; `/admin/*` | Adm; E2E | Done |
| 6.7 | Clear statuses avoid duplicate purchases | Row locks + unique index on active items | SC T07a/b; CC 1 | Done |
| 6.7 | Payment verified before Paid; Completed only after receipt; payment and order status separate | `Payments.Status` separate from `Orders.Status`; Paid only via a verified result | SC T16a–c; BR P09–P13 | Done |
| 6.7 | Sensitive payment data kept by the provider | No card / account columns; Bank QR shows a demo code labelled "simulated – do not transfer money" | – | Done |
| 6.7 | Passwords stored securely | BCrypt `Users.PasswordHash`; hashed verification and reset codes; attempt limits | Auth | Done |
| 6.7 | Login required for listings, orders, reviews; role-based access | JWT on every protected endpoint; Admin role on `/api/admin/**`; procedures check actor ids | Auth; Adm; BR F07, R06; CF C08 | Done |
| 6.7 | Input validation | Bean Validation + CHECK constraints (prices > 0, money ≥ 0, statuses, non-empty reasons) | Prod, Ord, Adm | Done |
| 6.7 | Users report products and accounts | `Reports`, `POST /api/reports`, `/admin/reports` | Adm | Done |
| 6.7 | Location data | Approximate demo areas (`LocationZones`, zone centres from OpenStreetMap), never exact addresses for distance | Ship | Decision · Done |

## 5. Decisions D1–D6 against the Business Plan

| Decision | Consistent with | Note |
|---|---|---|
| D1 delivery fee paid by the buyer, passed fully to the seller, no commission | 3.4, 4.1.4, 6.4 | Collected inside the online payment and passed on; UniMarket has no delivery revenue. Since V003 the fee is a simulated per-seller quote, free within 3 km. |
| D2 24 h to pay after confirmation (+ 30-min grace for in-flight payments) | 3.4, 6.5, 6.6 | The Business Plan sets no payment deadline; D2 adds one so reserved items are not blocked. Independent of the 24 h seller window. |
| D3 manual disputes and refunds by an admin | 3.3 | No automatic refunds; an approved refund is confirmed by its external reference. |
| D4 3 % on the items subtotal, no pilot exemption (approved 2026-11-02) | 4.1.1, 4.2 | Demo transactions only simulate the money flow. Standard listings stay free. |
| D5 reviews per completed order, both directions | 3.4 step 8, 6.3, 6.5 | – |
| D6 settlement at completion, admin-confirmed payout | 3.2, 6.6 (optional escrow) | Payout recorded with a reference; sandbox records marked simulated. |

## 6. Team decisions of November 2026 that replace Business Plan text

Details and the passages to rewrite: `BUSINESS_PLAN_CHANGE_PROPOSAL_2026-11.md`.

| Decision | Replaces | Implementation |
|---|---|---|
| Students of any university or college in Vietnam; FPT Hoa Lac is the first demo community | FPT Hoa Lac pilot only | Official campus or self-declared university at registration (V003) |
| Any valid email + OTP proves email ownership only | Institutional (.edu.vn) verification as student verification | UI says "Email verified", never "verified student" |
| No student-ID / FAP / SSO / manual student approval | "Verifies student credentials" | Not implemented by decision |
| Simulated shipping estimates, free ≤ 3 km | Undecided delivery fee source | V003 + `ShippingQuoteService`; real carriers are Future |
| Bank transfer by QR added as a third (simulated) method | MoMo, ZaloPay only | `BankQR` provider (V003); no real bank or VietQR |
| All payments simulated in the academic MVP | Real payment partners | Payment simulator (`PAYMENT_SIMULATOR_ENABLED`), refused in production |

## 7. Not in the MVP / known gaps

- Real payment gateways (provider contracts, callback signature verification of a real provider), real carriers,
  booking and tracking updates after shipping.
- Messaging / chat, notifications (`Notifications` table exists, no API), profile editing page, filter by major,
  accent-insensitive search, advertising.
- Order expiry is implemented but OFF in the demo profile to keep demo orders stable.
- Checkout idempotency (retry after a lost response) and a timeout status for abandoned promotion payments.
- Category management and hiding reviews (`Reviews.IsHidden`) have no admin API.
