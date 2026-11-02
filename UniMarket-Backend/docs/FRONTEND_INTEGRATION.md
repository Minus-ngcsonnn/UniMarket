# Frontend ↔ Backend integration notes (Backend Stage 1)

Written for: backend and frontend developers who will connect the React app to the Spring Boot API.

This file compares what the frontend already does (mock APIs in `UniMarket-Frontend/src/mocks/`)
with the database created by `UniMarket_BusinessAligned.sql` (database `UniMarketJava`).
It lists **differences that need a decision or a mapping**. It does not define API endpoints:
contracts are agreed per module in the following stages.

---

## 1. Frontend modules that need backend APIs

The frontend switches between mock and real implementations with Vite aliases
(`vite.config.js`). Every real API file currently rejects with `BackendPendingError`.
The real implementations must keep the same function names and return shapes as the mocks.

| Frontend file (real API) | Functions waiting for the backend | Main tables / procedures |
|---|---|---|
| `services/products/productApi.js` | `listProducts`, `getProduct`, `getProductsByIds`, `listUserListings`, `getCurrentUserId`, `listMyListings`, `getMyListing`, `createListing`, `updateListing`, `deleteListing` | `Products`, `ProductImages`, `vw_ProductCatalog`, `Categories`, `Campuses` |
| `services/orders/orderApi.js` | `listOrders`, `getOrder`, `getOrders`, `getActionCounts`, `placeOrders`, `cancelOrder`, `payOrder`, `confirmReceived`, `confirmOrder`, `declineOrder`, `markDelivering` (+ demo-only `simulateOtherParty`, `resetSampleData`) | `Orders`, `OrderStatusHistory`, `Payments`, `Deliveries`, `usp_PlaceOrder`, `usp_ConfirmOrder`, `usp_StartPayment`, `usp_RecordPaymentResult`, `usp_ShipOrder`, `usp_CompleteOrder`, `usp_CancelOrder`, `usp_ExpirePendingOrders` |
| `services/account/accountApi.js` | `getMyProfile`, `getUserProfile`, `updateProfile`, `listUserReviews`, `getRatingSummary`, `getOrderReviews`, `submitReview`, `createReport` | `Users`, `vw_PublicProfiles`, `vw_UserRatings`, `Reviews`, `Reports` |
| `services/admin/adminApi.js` | `getOverview`, `listListings`, `listUsers`, `listReports`, `listOrders`, `listCategories`, `getBadgeCounts`, `approveListing`, `blockListing`, `removeListing`, `suspendUser`, `reactivateUser`, `resolveReport`, `dismissReport`, `exportReport` | `vw_AdminDashboard`, `Products`, `Users`, `Reports`, `AdminActions` |
| `services/cart/cartStore.js` (localStorage today) | cart contents | `CartItems` (+ `trg_Cart_Validate`) |
| `services/saved/savedStore.js` (localStorage today) | saved items | `Favorites` |
| Login / Register / OTP pages (no API file yet) | sign-in, registration, email OTP, password reset | `Users`, `EmailVerificationTokens`, `PasswordResetTokens`, `UniversityEmailDomains`, `usp_VerifyEmail` |
| `services/healthService.js` | `GET /api/health` | **Done in Stage 1** |

Not in the database (frontend only): Messages (out of MVP scope), the Contact form, notification inbox UI
(`Notifications` table exists but the frontend has no inbox yet).

---

## 2. Value mappings

### Product condition

| Frontend / API | SQL `Products.Condition` |
|---|---|
| `NEW` | `New` |
| `LIKE_NEW` | `Like New` |
| `USED` | `Used` |

### Product status

| Frontend / API | SQL `Products.Status` |
|---|---|
| `AVAILABLE` | `Available` |
| `RESERVED` | `Reserved` |
| `SOLD` | `Sold` |
| *(not shown to buyers)* | `Draft` – internal, never listed |
| *(not shown)* | `Removed` – soft removal; the admin "Remove listing" action |

### Listing moderation

| Frontend `moderation` | SQL `Products.ModerationStatus` | Note |
|---|---|---|
| `PENDING` | `Pending` | |
| `APPROVED` | `Approved` | SQL default is `Approved` |
| `BLOCKED` | `Rejected` | Frontend shows the admin's reason to the seller; SQL keeps reasons in `AdminActions.Reason` |

### Order status

| Frontend | SQL `Orders.Status` |
|---|---|
| `PENDING` | `Pending` |
| `AWAITING_PAYMENT` | `AwaitingPayment` |
| `PAID` | `Paid` |
| `DELIVERING` | `Delivering` |
| `COMPLETED` | `Completed` |
| `CANCELLED` | `Cancelled` |

### Account and report status

| Frontend | SQL |
|---|---|
| Account `ACTIVE` / `SUSPENDED` | `Users.Status` `Active` / `Suspended` / **`Closed`** (no frontend label yet) |
| Role `STUDENT` / `ADMIN` | `Users.Role` `Student` / `Admin` |
| Report `OPEN` / `RESOLVED` / `DISMISSED` | `Reports.Status` `Open` / **`Reviewing`** / `Resolved` / `Dismissed` |

### Payment provider

| Frontend `PAYMENT_METHODS` | SQL `PaymentProvider` |
|---|---|
| `MOMO` | `MoMo` |
| `ZALOPAY` | `ZaloPay` |

Mapping should live in one place in the backend (enums with a database value), never in controllers.

---

## 3. Differences that need a team decision

These are real mismatches between the current frontend and the SQL script. The backend must not
silently pick one; each needs a decision before the module is implemented.

1. **Checkout and order grouping (most important).**
   - Frontend: `placeOrders` creates **one order per seller** containing several items (`productIds`, `amount` = sum).
   - SQL: **one order = one listing**. Checkout calls `usp_PlaceOrder` once per item, in ascending `ProductId`
     order, inside **one Java transaction**; items may only be *grouped visually* by seller.
   - Impact: order lists, order detail, seller confirmation, payment and reviews are per item in SQL.
   - **Decision (2026-11-02):** the database will be changed to **`Orders` + `OrderItems`** (one order per
     seller with several items), matching the frontend. Order processing is **not** implemented until the
     updated SQL script is available.
2. **When the payment method is chosen.** Frontend: at payment time (`paymentMethod` is `null` until paid).
   SQL: `Orders.PaymentProvider` is **required when the order is placed**.
3. **Shipping fee and commission.** SQL stores `ShippingFee`, a fixed 3 % `CommissionRate`, `SellerProceeds`
   and `SellerSettlements`. The frontend shows neither a shipping fee nor commission.
4. **Delivery step.** SQL `usp_ShipOrder` requires a **carrier and tracking number**; the frontend's
   "Mark as delivering" sends neither.
5. **Profile fields.** Frontend profile has `programme`, `bio`, `memberSince`, `emailType`; SQL `Users` has no
   programme or bio columns (`CreatedAt` can serve as member since). SQL has `Phone`, `ZaloUrl`, `ShowContact`,
   `AvatarUrl`, while the frontend tells students not to share phone numbers.
6. **Campuses.** Frontend filters by `HANOI`, `HCMC`, `DA_NANG`; SQL contains one campus, `FPT Hoa Lac`
   (ids, not codes).
7. **Categories.** Frontend has 5 slugs (`textbooks`, `electronics`, `dorm-items`, `fashion`, `study-gear`);
   SQL has 7 names (adds `Sports`, `Bikes & Ride`; uses `Dormitory items`, `Study equipment`) and no slug column.
8. **Featured listings.** Frontend uses a `featured` flag; SQL derives `IsFeatured` from paid `ProductPromotions`.
9. **Discounts.** SQL demo data has `OriginalPrice = NULL` for every listing, so the Deals page and
   "% off" badges will be empty with real data (correct behaviour; the UI must not invent discounts).
10. **Images.** SQL demo rows reference `images/demo/products/item-XX-front.svg`. These files are not in the
    repository yet; the backend needs an agreed folder and URL for serving uploaded and demo images.
11. **Identifiers.** Frontend ids are numbers for listings/orders (shown as `UM-2048`, `UO-3001`) but strings
    for users (`u-minh`). SQL ids are `int`/`bigint`. Display codes stay a frontend concern.
12. **Admin "Reviewing" report status and `Closed` accounts** have no frontend state yet.

---

### 3.1 Classification after the V002 database alignment (2026-11-02)

V002 is prepared in `database/migrations/` with the final decisions D1–D6 and tested on copies; it is **not applied** to `UniMarketJava` yet.
Business Plan references: 6.6 (payment flow), 4.1.1 (3 % commission), delivery section (no platform delivery fee).

| # | Difference | Classification | Resolution |
|---|---|---|---|
| 1 | Order grouping | **Database change** (V002) | `Orders` + `OrderItems`, one order per seller, `usp_Checkout` all-or-nothing. Frontend model already matches; the order API returns items per order. |
| 2 | Payment method timing | **Database change** (V002) | `Orders.PaymentProvider` optional until payment; `usp_StartPayment @Provider`. Matches the frontend and Business Plan 6.6. |
| 3a | Commission | **Database change** (V002) + **DTO** | 3 % of the merchandise subtotal, deducted from seller proceeds; no exemption in the demo phase (D4, approved by the team 2026-11-02). Admin "Completed order value" can use `Subtotal`; seller views may show proceeds later. |
| 3b | Delivery fee | **Database change** (V002, D1) + **Frontend adjustment** | Buyer pays it online with the order; seller receives all of it (`SellerPayoutTotal`); no commission on it. The frontend must show the fee before payment (checkout, order detail) and the seller payout on sales. |
| 3c | Payment deadline | **Database change** (V002, D2) + **Frontend adjustment** | 24 h from seller confirmation (`PaymentDueAt`); unpaid orders expire. Show the deadline on "Awaiting payment" orders. |
| 3d | Refunds / disputes | **Database change** (V002, D3) + **Deferred** (admin/API) | `OrderDisputes`, decided manually by an admin; no automatic refund. Buyer "report a problem" on a paid order and admin screens come with the order/admin API. |
| 3e | Seller payout | **Database change** (V002, D6) + **Deferred** (admin/API) | Settlement calculated at completion (Pending); admin confirms the payout with a transfer reference (Released). |
| 4 | Courier / tracking number | **Database change** (V002) | Optional; "Mark as delivering" works without them. |
| 5a | `programme`, `bio` on profiles | **Business decision** | Not in `Users`. Add columns in a later migration only if the team keeps these fields; otherwise remove them from the frontend profile form. Not added now. |
| 5b | `memberSince`, `emailType`, `verified` | **Backend DTO** | `memberSince = Users.CreatedAt`; `emailType` / verified badge from the email domain (`UniversityEmailDomains`) + `EmailVerifiedAt`. |
| 5c | Phone / Zalo contact | **Frontend adjustment** | The Business Plan lists phone/Zalo contact as a feature (`Users.Phone`, `ZaloUrl`, `ShowContact`); the frontend text "don't share phone numbers" must be revised. |
| 6 | Campuses | **Backend DTO** + **Frontend adjustment** | Database has campus ids (one: FPT Hoa Lac). The API returns campus id + name; the frontend's hard-coded HANOI/HCMC/DA_NANG list should come from the API. |
| 7 | Categories | **Backend DTO** + **Frontend adjustment** | Names differ (`Dormitory items`, `Study equipment`) and SQL has 7. API returns id + name (slug derived in the DTO); the frontend should load categories from the API instead of 5 constants. |
| 8 | Featured | **Backend DTO** | `featured = vw_ProductCatalog.IsFeatured` (paid promotion active). No column added. |
| 9 | Discounts | **No change** | `OriginalPrice` stays optional; UI shows no "% off" without it (already the rule). |
| 10 | Demo images (`.svg`) | **Deferred** (product module) | Decide the image folder/URL with the image upload feature. |
| 11 | Identifiers | **Backend DTO** | Numeric ids; `UM-` / `UO-` display codes stay in the frontend; user ids become numbers. |
| 12a | Moderation `BLOCKED` ↔ `Rejected` | **Backend DTO** | Map in an enum; the reason comes from `AdminActions.Reason`. |
| 12b | Report `Reviewing`, account `Closed` | **Deferred** (admin module) | Map `Reviewing` to the frontend's "Open" until an admin "in review" state is designed. |
| 13 | Conditions / statuses | **Backend DTO** | `New/Like New/Used` ↔ `NEW/LIKE_NEW/USED`; `Available/Reserved/Sold` ↔ `AVAILABLE/RESERVED/SOLD`; `Draft`/`Removed` never shown to buyers. |
| 14 | Reviews | **No change** | Per order, buyer ↔ seller, only after completion, one per side (trigger + unique key). Matches the frontend. Decision D5: reviews stay per completed order (buyer ↔ seller), not per item. |

---

## 4. Conventions already in place (Stage 1)

- All endpoints live under `/api`; the Vite dev server proxies `/api` to `http://localhost:8080`.
- Errors use one JSON shape (`com.unimarket.common.ApiErrorResponse`):
  `timestamp`, `status`, `error`, `code`, `message`, `path`, optional `fieldErrors[]`.
  The frontend should branch on `code`, not on `message`.
- Server and database errors return a generic message only; details are logged on the server.
- Errors raised by stored procedures (`THROW 51xxx`) will be translated into specific `code` values per
  module, so procedure text is never shown to students.
- Timestamps are UTC (`SYSUTCDATETIME()`); the API should send ISO-8601 instants, the frontend formats them.
- Money is whole VND (`decimal(18,0)`); the API should send integers.
