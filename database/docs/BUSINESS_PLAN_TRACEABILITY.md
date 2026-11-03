# Business Plan → database traceability (V001 + V002)

Written for: the team and reviewers checking that the database implements the UniMarket Business Plan
(version updated 31 October 2026, sections 3, 4 and 6).

Status legend: **Done** = enforced by the database and covered by tests · **Done (V001)** = already in the
baseline, unchanged by V002 · **Backend** = the database provides the data/guards, the rest belongs to a later
backend/frontend stage · **Future** = explicitly out of the initial scope in the Business Plan.

Test files (all in `database/tests/`, run on disposable copies by `run_v002_tests.ps1`):
`SC` = `V002_order_scenarios_test.sql` (T…), `BR` = `V002_business_rules_D1_D6_test.sql` (F/P/R/V/E…),
`CF` = `V002_seller_confirmation_test.sql` (C…), `CC` = `V002_concurrency_test.ps1` (races 1–6),
`POST` = `validation/V002_post_migration_checks.sql`.

## Section 3 – Business model and process

| BP | Requirement | SQL implementation | Tests | Status |
|---|---|---|---|---|
| 3.1, 6.2 | Students both buy and sell; one account | `Users` (Role Student/Admin), no buyer/seller split | – | Done (V001) |
| 3.2 | ~~Verify with institutional email~~ → **superseded (team decision, Nov 2026)**: register with any valid email + OTP (email ownership only); no student verification | `EmailVerificationTokens` (hashed), `Users.EmailVerifiedAt`, `usp_VerifyEmail`; `UniversityEmailDomains` no longer used by the backend; checkout requires a verified active buyer and seller | Backend `AuthIntegrationTest` (Gmail, Outlook, Yahoo, institutional, other domains) | Done (backend); campus for non-FPT students **BLOCKED** (V003 proposal) |
| 3.2 | Listing: photos, condition, price, description, campus | `Products`, `ProductImages`, `Campuses`, `Categories` | – | Done (V001) |
| 3.2, 6.7 | Contact by phone / Zalo, only if the user chooses | `Users.Phone`, `ZaloUrl`, `ShowContact`; `vw_PublicProfiles` hides them unless `ShowContact = 1` | – | Done (V001) + Frontend text to revise |
| 3.2 | Platform moderates listings, enforces rules | `Products.ModerationStatus`, `Reports`, `AdminActions` | – | Done (V001) + Backend (admin API) |
| 3.2, 6.6 | Optional escrow: payment held until completion, then released | Settlement created only at completion (`Pending`), released by an admin (`usp_MarkSettlementReleased`) | BR F03, F11–F15 | Done (V002, D6) |
| 3.3 | Operations team handles disputes | `OrderDisputes`, `usp_OpenOrderDispute`, `usp_ResolveOrderDispute`, `usp_ConfirmDisputeRefund` | BR R01–R12, F10 | Done (V002, D3) |
| 3.3 | Payment partners MoMo, ZaloPay | `Payments.Provider` / `Orders.PaymentProvider` CHECK `MoMo`, `ZaloPay` | SC T09, BR P13 | Done (V001) |
| 3.4 step 1 | Conditions New / Like New / Used | `Products.Condition` CHECK | – | Done (V001) |
| 3.4 step 4 | Place order, delivery address at checkout | `usp_Checkout` requires recipient, phone, address | SC T02, T03, T20 | Done (V002) |
| 3.4 step 4 | No in-person payment, no bank transfer to sellers, no COD | Only online providers; no COD/transfer columns or states | – | Done (V001) |
| **3.4 step 5** | **Seller confirms availability within 24 hours** | `Orders.ConfirmBy` = placement + 24 h (default); `usp_ConfirmOrder` refuses after `ConfirmBy` or by anyone else (51007); `usp_ExpirePendingOrders` cancels unconfirmed orders and releases all items; seller decline = `usp_CancelOrder` | CF C01–C08, SC T11a, T17, T21, CC 5–6 | **Done** (V001 + V002) |
| 3.4 step 6 | Seller arranges delivery after successful payment | `usp_ShipOrder` only on `Paid` orders, by the seller; courier optional | SC T16b | Done (V002) |
| 3.4 step 7 | Buyer confirms receipt to complete | `usp_CompleteOrder` only by the buyer, only `Delivering`, needs a successful payment | SC T16b, T16c | Done |
| 3.4 step 8 | Both parties rate each other | `Reviews`, `trg_Reviews_Validate`, `UNIQUE (OrderId, ReviewerId)` | BR V01–V04, SC T22a/b | Done (V001, D5) |

## Section 4 – Revenue model

| BP | Requirement | SQL implementation | Tests | Status |
|---|---|---|---|---|
| 4.1.1 | 3 % commission on completed online transactions, deducted from the seller (500 000 → 15 000, seller 485 000) | `Orders.CommissionRate` CHECK 0.03; `CommissionAmount`, `SellerProceeds` computed on the merchandise subtotal; settlement CHECK | BR F01, F03, F04, F16; SC T10; POST | Done (D4) |
| 4.1.1 | Payments stay within the website checkout | All payments via `Payments` attempts; no seller transfer path | SC T09 | Done |
| 4.1.2 | Listing boosts 24 h 5 000, featured 3 days 15 000, 7 days 30 000 | `PromotionPackages`, `ProductPromotions`, `vw_ProductCatalog.IsFeatured` | – | Done (V001) + Backend |
| 4.1.3 | Advertising | – | – | Future |
| 4.1.4 | No subscriptions | – | – | Done (nothing to build) |
| 4.1.4, 6.4 | UniMarket does not provide delivery or charge delivery fees; delivery costs disclosed before payment | D1: the buyer's delivery fee is passed **entirely** to the seller (`SellerPayoutTotal`, settlement `ShippingFee`); UniMarket keeps nothing of it and takes no commission on it. **Selected direction (Nov 2026): carrier-quoted fee** (distance / area, e.g. GrabExpress, Ahamove) — not integrated; today a configured flat fee per order (dev/demo) | BR F01–F04; `OrderIntegrationTest` | D1 done; carrier quote DEFERRED, details PENDING |
| 4.2 | Free listing, search, contact; paid commission and promotions | No fee columns on listing or search | – | Done (V001) |
| 4.2, 4.2.1 | *May* temporarily waive commission during the pilot | **D4 officially approved by the team (2026-11-02): no exemption** – 3 % also applies in the MVP/demo phase; `CommissionRate` fixed at 0.03 | BR F04 | Done (team decision D4 replaces the optional waiver) |
| 4.3.4 | Provider fee ≈ 1 % (cost assumption) | Not stored (platform cost, not a transaction field) | – | Not applicable |

## Section 6 – E-commerce system

| BP | Requirement | SQL implementation | Tests | Status |
|---|---|---|---|---|
| 6.3 | Cart and Buy Now | `CartItems` (+ `trg_Cart_Validate`); Buy Now = `usp_Checkout` with one listing | SC T08 | Done |
| 6.3 | Order management and tracking for both sides | `Orders`, `OrderItems`, `OrderStatusHistory` | SC T02, T03 | Done (V002) + Backend (API) |
| 6.3, 6.5 | Search/filter by keyword, category, price, condition, university, campus | `IX_ProductSearch`, `vw_ProductCatalog` (campus → university) | – | Done (V001) + Backend; filter by major not stored |
| 6.5 | Order flow Pending → Awaiting Payment → Paid → Delivering → Completed, or Cancelled | `Orders.Status` CHECK + timestamp consistency CHECK | SC T16b, BR P05, CF C04 | Done |
| 6.5 | Products Available → Reserved → Sold; sold items cannot be bought again | `Products.Status`; checkout locks rows; `vw_ActiveOrderItems` unique index | SC T05, T07a/b, T16b; CC 1 | Done (V002) |
| 6.5, 6.6 | Payment request to provider and verified result updates payment + order | `usp_StartPayment`, `usp_RecordPaymentResult` (amount, reference, provider, duplicates) | SC T09, T16a; BR P07–P14; CC 2, 4 | Done (V002) + Backend (gateway call, signature check) |
| 6.6 | Place Order → Seller Confirmation → Website Checkout → Payment | Provider chosen at payment (`Orders.PaymentProvider` optional until paid) | SC T18, T09 | Done (V002) |
| 6.5 | Orders may be cancelled when the transaction cannot complete | `usp_CancelOrder` (unpaid only), `usp_ExpirePendingOrders` (confirmation and payment timeouts) | SC T11a–d, T17; BR P05, P10; CF C03–C04 | Done |
| 6.5 | Admin reviews users, products, orders, reports; removes listings, restricts accounts | `Users.Status`, `Products.Status = Removed`, `Reports`, `AdminActions` | – | Done (V001) + Backend |
| 6.7 | Clear product and order statuses avoid duplicate purchases | Row locks + unique index on active items | SC T07a/b; CC 1 | Done |
| 6.7 | Payment verified before Paid; completed only after receipt; payment and order status tracked separately | `Payments.Status` separate from `Orders.Status`; Paid only via verified result; Completed only via buyer | SC T16a–c; BR P09–P13 | Done |
| 6.7 | Sensitive payment data kept by the provider | No card / account data columns | – | Done (V001) |
| 6.7 | Passwords stored securely | `Users.PasswordHash`; hashed reset / verification tokens | – | Done (V001) + Backend (BCrypt) |
| 6.7 | Login required for listings, orders, reviews; role-based access | Procedures check actor ids and admin role where relevant | BR F07, R06; CF C08 | Backend (authentication, RBAC) |
| 6.7 | Input validation | CHECK constraints (prices > 0, money ≥ 0, statuses, non-empty reasons) | – | Done + Backend (request validation) |
| 6.7 | Users report products and accounts | `Reports` | – | Done (V001) + Backend |

## Decisions D1–D6 against the Business Plan

| Decision | Consistent with | Note |
|---|---|---|
| D1 delivery fee paid by buyer, passed fully to the seller, no commission | 3.4, 4.1.4, 6.4 | UniMarket only collects it inside the online payment and passes it on; no delivery revenue. |
| D2 24 h to pay after confirmation (+ 30-min grace for in-flight callbacks) | 3.4, 6.5, 6.6 | The Business Plan sets no payment deadline; D2 adds one so reserved items are not blocked. Independent of the 24 h seller window. |
| D3 manual disputes / refunds by admin | 3.3 | No automatic refunds. |
| D4 3 % on merchandise subtotal, no pilot exemption – **officially approved by the team on 2026-11-02** | 4.1.1, 4.2 | 4.2 / 4.2.1 say a waiver *may* be used; the team decided not to. Demo transactions only simulate the money flow (sandbox payments, no real money). Standard listings stay free. |
| D5 reviews per completed order, both directions | 3.4 step 8, 6.3, 6.5 | – |
| D6 settlement at completion, admin-confirmed payout | 3.2, 6.6 (optional escrow) | – |

## Belongs to later backend / frontend stages (not V002)

- Authentication, sessions/JWT, password hashing (BCrypt), role-based authorization on every endpoint.
- Registration with OTP e-mail (done, Stage 2; Nov 2026: any email, no institutional-domain check).
- Payment gateway integration: create the provider request, **verify callback signatures**, map provider order id to
  `RequestKey`, call `usp_RecordPaymentResult`; alert an admin when it returns 51026 for a charged payment.
- **Scheduling `usp_ExpirePendingOrders`** (e.g. every minute and before listing pending orders). Until it runs, an
  unconfirmed order past `ConfirmBy` already cannot be confirmed or paid, but its items stay Reserved.
- Delivery fee: shown before payment (done, Stage 4, configured flat fee); carrier quotes selected but not integrated.
- Notifications on new orders / confirmations / deadlines (`Notifications` table exists).
- Admin screens: moderation, reports, disputes, refunds, payout confirmation.
- Search API, image upload/storage, promotions purchase, phone/Zalo contact display.
- Advertising (future).

## Team decisions of November 2026 that supersede Business Plan text

See `BUSINESS_PLAN_CHANGE_PROPOSAL_2026-11.md` for the passages to update in the Business Plan itself.

| Decision | Replaces | Implementation |
|---|---|---|
| Target audience: university and college students across Vietnam; FPT Hoa Lac is only the first demo community | FPT Hoa Lac pilot as the only eligible community | No FPT-only rule in code; campus model for other universities needs V003 / reference data |
| Register with any valid email; OTP proves email ownership only | Institutional (.edu.vn) email verification as student verification | Backend + frontend updated; no "verified student" status or badge |
| No student-ID / FAP / SSO / manual student approval | "Verifies student credentials" (3.2) | Not implemented by decision |
| Shipping quoted by a logistics provider (distance, area) | Undecided delivery fee source | Direction documented; integration deferred; configured flat fee is temporary |
