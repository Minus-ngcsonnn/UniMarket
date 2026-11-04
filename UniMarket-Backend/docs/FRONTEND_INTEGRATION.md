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
| `services/products/productApi.js` | `listProducts`, `getProduct`, `getProductsByIds`, `listUserListings`, `getCurrentUserId`, `listMyListings`, `getMyListing`, `createListing`, `updateListing`, `deleteListing` | **Stage 3 API ready** (`docs/PRODUCTS_API.md`, mapping in 3.3). `getProductsByIds` waits for Stage 4 | `Products`, `ProductImages`, `vw_ProductCatalog`, `Categories`, `Campuses` |
| `services/orders/orderApi.js` | `listOrders`, `getOrder`, `getOrders`, `getActionCounts`, `placeOrders`, `cancelOrder`, `payOrder`, `confirmReceived`, `confirmOrder`, `declineOrder`, `markDelivering` (+ demo-only `simulateOtherParty`, `resetSampleData`) | **Stage 4 API ready** (`docs/ORDERS_API.md`, mapping in 3.4). | `Orders`, `OrderStatusHistory`, `Payments`, `Deliveries`, `usp_PlaceOrder`, `usp_ConfirmOrder`, `usp_StartPayment`, `usp_RecordPaymentResult`, `usp_ShipOrder`, `usp_CompleteOrder`, `usp_CancelOrder`, `usp_ExpirePendingOrders` |
| `services/account/accountApi.js` | `getMyProfile`, `getUserProfile`, `updateProfile`, `listUserReviews`, `getRatingSummary`, `getOrderReviews`, `submitReview`, `createReport` | `Users`, `vw_PublicProfiles`, `vw_UserRatings`, `Reviews`, `Reports` — **Stage 5 API ready** (`docs/ADMIN_API.md`, mapping in 3.5) |
| `services/admin/adminApi.js` | `getOverview`, `listListings`, `listUsers`, `listReports`, `listOrders`, `listCategories`, `getBadgeCounts`, `approveListing`, `blockListing`, `removeListing`, `suspendUser`, `reactivateUser`, `resolveReport`, `dismissReport`, `exportReport` | `vw_AdminDashboard`, `Products`, `Users`, `Reports`, `AdminActions` — **Stage 5 API ready** (`docs/ADMIN_API.md`, mapping in 3.5) |
| `services/cart/cartStore.js` (localStorage today) | cart contents: **Stage 4 API ready** (`/api/cart`) | `CartItems` (+ `trg_Cart_Validate`) |
| `services/saved/savedStore.js` (localStorage today) | saved items: **Stage 3 API ready** (`/api/me/favorites`) | `Favorites` |
| Login / Register / OTP pages (no API file yet) | **Stage 2 API ready** (`docs/AUTH_API.md`): register, verify, resend, login, me. Password reset not built yet | `Users`, `EmailVerificationTokens`, `PasswordResetTokens`, `UniversityEmailDomains`, `usp_VerifyEmail` |
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
| 5b | `memberSince`, `emailType`, `verified` | **Backend DTO** | `memberSince = Users.CreatedAt`; `emailVerified = EmailVerifiedAt IS NOT NULL`. **Nov 2026:** no `verified` / verified-student badge and no `emailType` (the email domain decides nothing). |
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

## 3.2 Authentication integration (Backend Stage 2)

The API is implemented and tested; the frontend still uses its mock sign-in. Changes needed when wiring it
(no frontend code was changed in Stage 2):

| Frontend place | Today | Needed |
|---|---|---|
| `RegisterPage` | full name, email, password, confirm, terms (university-email mode removed, Nov 2026) | Call `POST /api/auth/register`. **Any valid email** is accepted (no domain rule, no `UNSUPPORTED_EMAIL_DOMAIN`). **`campusId` is required**: add a campus select filled from `GET /api/campuses` (only existing campuses; never guessed from the email). Today the list has one campus (FPT Hoa Lac): students of other universities are blocked until V003 / reference data is approved. Show `EMAIL_ALREADY_REGISTERED`, `INVALID_CAMPUS` and `fieldErrors`. Same password rule (8+, a letter and a digit). |
| `VerifyEmailDialog` (6 digits) | mock | `POST /api/auth/verify-email`; "resend code" → `POST /api/auth/resend-verification` (always 202; show the cooldown text); handle 429 by offering a new code. |
| `LoginPage` | mock | `POST /api/auth/login`; 401 → "email or password is incorrect"; 403 `EMAIL_NOT_VERIFIED` → open the code dialog; 403 `ACCOUNT_DISABLED`; 429 → wait. "Remember me" has no server meaning (token lifetime is fixed). |
| Token storage | none | Keep the access token **in memory** (or `sessionStorage` if a reload must keep the session); never in `localStorage` (earlier rule). Send `Authorization: Bearer` via an axios interceptor in `services/apiClient.js`. |
| Header (guest / demo toggle), `AccountMenu`, `useViewer` | demo student, dev guest toggle | Viewer = `GET /api/auth/me` when a token exists, else guest. "Sign out" deletes the token (no server call). On any 401, clear the token and show the guest header. |
| Protected pages (sell, cart, checkout, orders, profile, shop, settings) | open to the demo student | Redirect guests to `/login?next=...` (already done for Sell). |
| Admin area | "Admin dashboard (demo)" link | Show only when `user.role === 'ADMIN'`; the API enforces it anyway (403). |
| Profile fields `programme`, `bio` | mock | Not in the database (decision pending, see 3.1). |

## 3.3 Products, categories and favorites integration (Backend Stage 3)

The API is implemented and tested (`docs/PRODUCTS_API.md`); the frontend still uses `mockProductApi.js` and
the localStorage saved store. No frontend code was changed in Stage 3. Mapping for the real `productApi.js`:

| Frontend function / field | Mock today | Real API / mapping |
|---|---|---|
| `listProducts({ q, category, conditions, campuses, minPrice, maxPrice, sort, featured, deals, page, pageSize })` | filters in memory | `GET /api/products?q=&categoryId=&condition=&campusId=&minPrice=&maxPrice=&sort=&featured=&deals=&page=&size=` |
| result `{ items, total, page, pageSize, facets }` | | `{ items, totalItems, page, size, totalPages, facets }`: rename `totalItems → total`, `size → pageSize` |
| `category` (slug) | `p.categorySlug` | Send `categoryId`. Load `GET /api/categories` once and map slug ↔ id (each category has a derived `slug`, e.g. `bikes-and-ride`). The frontend's `CATEGORIES` slugs must be checked against these. |
| `campuses` (`'HANOI'`) | campus keys | Send `campusId` (FPT Hoa Lac = id from `GET /api/campuses`). Replace the `CAMPUSES` constant with API data, or map `HANOI → 1`. Only one value per request (the pilot has one campus). |
| `facets.categories` / `facets.campuses` | keyed by slug / campus key | Keyed by **id** (string); map with the category/campus lists. `facets.total` = sum of `facets.conditions`. |
| `sort` | `newest`, `price_asc` | Same values (+ `price_desc`). With `deals` the mock sorts by savings; the API keeps the chosen sort. |
| `page` | 1-based | 1-based. Use `size=9` (`CATALOG_PAGE_SIZE`). |
| product `campus` | `'HANOI'` | object `{ id, name, universityId, university }` |
| product `categorySlug` | string | `category.slug` (`category` is `{ id, name, slug }`) |
| product `images[]` / main image | mock image paths | Detail: `images[]` (`{ id, url, sortOrder }`, first = main). Catalog: `mainImageUrl`. Demo URLs are returned root-relative (`/images/demo/products/…`, DB unchanged) and the files do not exist yet: `ImageSlot` (also used by the gallery) now shows its placeholder when a photo fails to load; uploaded ones start with `/media/products/` (proxy `/media` to the backend in `vite.config.js`, like `/api`). |
| product `seller` (`MOCK_SELLERS`) | phone/Zalo in mock | Catalog: `{ id, fullName }`. Detail: `{ id, fullName, emailVerified, campus, memberSince, ratingAverage, ratingCount, contact? }`. `contact` = `{ phone, zaloUrl }` only when the seller shares it (`ShowContact`); show the phone/Zalo buttons only then. Email is never sent. **Badge compatibility:** the API never sends `verified`, so `SellerCard` (reads `seller.verified`) shows no "Verified student" badge, and `VerificationBadge` shows "Email verified" from `emailVerified`. This is intended while student verification is a pending decision; do not map `emailVerified` to `verified`. |
| `status` / `purchasable` | `status` | Same `status` values; use `purchasable` to enable "Add to cart"/"Buy". |
| `moderation` | `PENDING/APPROVED/BLOCKED` | Same values, only on own listings (`GET /api/me/products`, or detail with the owner's token). |
| `featured` | flag in mock data | Computed from running paid promotions (`ProductPromotions`). |
| `originalPrice` / deals | mock values | Omitted when not set. No demo listing has one, so `deals=true` returns nothing until sellers enter original prices. |
| `getProduct(id)` | null when hidden | `GET /api/products/{id}`; 404 → null. Send the token so sellers see their pending listings. |
| `listUserListings(userId)` | | `GET /api/products?sellerId={userId}&size=50` |
| `getProductsByIds(ids)` (cart, checkout) | | Stage 4: `GET /api/products/by-ids?ids=…` (see 3.4). |
| `getCurrentUserId()` | constant | `GET /api/auth/me` → `id` (Stage 2). |
| `listMyListings()` | | `GET /api/me/products` |
| `getMyListing(id)` | | `GET /api/products/{id}` with the token; use it only when `editable` is true. |
| `createListing(form, files)` | `{ saved: false }` | `POST /api/products`, multipart: part `listing` (JSON blob, `application/json`) + parts `photos`. Do **not** send a seller id. The response has `moderation: "PENDING"`: show "Sent for review". |
| `updateListing(id, form)` | | `PUT /api/products/{id}` (JSON). Photos: `POST /api/products/{id}/images`, `DELETE …/images/{imageId}`, `PUT …/images/order`. Tell the seller an edit goes back to review. |
| `deleteListing(id)` | | `DELETE /api/products/{id}` (204). 409 `LISTING_NOT_EDITABLE` → "Reserved or sold listings cannot be removed". |
| `savedStore.js` (localStorage) | ids in localStorage | `GET /api/me/favorites`, `PUT`/`DELETE /api/me/favorites/{productId}`. Guests: keep the "sign in to save" prompt. Old localStorage ids can be sent once with `PUT` after sign-in, then cleared. |

Validation: the backend uses the same limits as `LISTING_LIMITS` (title 5–80, description 20–1000,
price 1,000–100,000,000, original price higher than price, 1–8 photos, JPG/PNG/WebP ≤ 5 MB) and returns
`fieldErrors` with the same field names, so the form can show them next to the fields.

Open points for the team (not decided in Stage 3):

1. **Seller contact visibility**: `seller.contact` follows `Users.ShowContact` (Business Plan 3.2, 6.7) and is shown
   to every visitor of a public listing. The team may decide to show it to signed-in students only.
   The profile settings page must let the student set `ShowContact`, phone and Zalo (Profile API, later stage).
2. **Admin moderation API** (approve / block listings): not built. Nothing in the backend or database approves a
   listing (no procedure or trigger; an admin edit also returns it to `PENDING`), so new listings stay `PENDING`
   and are not public until the Admin stage. Meanwhile they can be approved only by a manual database update.
3. **Demo photo files**: the 100 `ProductImages` rows point to `images/demo/products/*.svg`, which do not exist.
   Handled without changing data: placeholder on load error (frontend) + root-relative URLs (API). Adding real files
   under `UniMarket-Frontend/public/images/demo/products/` would make them appear.
4. **Personal-email students** (Stage 2 pending decision): unchanged; listings require a verified account.

## 3.4 Cart, checkout and orders integration (Backend Stage 4)

The API is implemented and tested (`docs/ORDERS_API.md`); the frontend still uses `mockOrderApi.js` and the
localStorage cart. No frontend code was changed in Stage 4. Mapping for the real `orderApi.js` and cart:

| Frontend function / field | Mock today | Real API / mapping |
|---|---|---|
| `cartStore` (localStorage ids + `selected`) | browser only | `GET /api/cart`, `PUT`/`DELETE /api/cart/items/{id}`, `DELETE /api/cart`. `selected` stays a frontend-only flag; send the selected ids to checkout. Guests: keep the local cart and add it with `PUT` after sign-in. |
| Cart page grouping | by seller in the page | `groups[]` (one per seller = one order) with `subtotal`, `shippingFee`, `total`; `unavailable[]` with `reason`. Checkout page: `POST /api/cart/validate` = preview with fees before confirming. `shippingFeePolicy.approved = false`: label the fee provisional, never "free shipping". |
| `getProductsByIds(ids)` | mock | `GET /api/products/by-ids?ids=…` (public, request order, hidden ids left out) |
| Shipping | none in the mock | Show `shippingFee` per seller group and `shippingFeePolicy` before confirming. `approved: false` + `plannedMethod: "CARRIER_QUOTE"`: label the fee "provisional"; carrier quotes are the selected direction but not integrated. Never show "free shipping" for 0. |
| Price shown before paying | product price | Send `expectedPrices` to `POST /api/cart/validate` or `/api/checkout`; 409 `PRICE_CHANGED` → reload the cart |
| `placeOrders({ productIds, delivery })` | `{ orders, isSample }` | `POST /api/checkout` → `{ orders }` (201). `delivery.fullName → recipientName`, `phone → recipientPhone`, `address → deliveryAddress`. **`campus` and `note` are not stored** (no columns); put needed details into the address text, or keep the note client-side until a decision. |
| order `amount` | sum of prices | `amounts.total` (what the buyer pays) = `subtotal` + `shippingFee`. Show `subtotal`, `shippingFee`, `total` on cart, checkout and order pages. |
| order `productIds` / `items[].price` | product ids, current prices | `items[]` with `productId`, `title`, `unitPrice` (**snapshot at checkout**), `quantity` (1), `imageUrl` |
| `seller` / `buyer` (`MOCK_SELLERS`) | phone etc. | `{ id, fullName }`. Delivery details in `delivery`: buyer and admin always; **seller only while PAID or DELIVERING** (after the verified payment). The seller UI must not expect the address/phone before payment (show "Delivery details appear after payment"). |
| `role` (`'buyer'`/`'seller'`) | lowercase | `role`: `BUYER`, `SELLER`, `ADMIN` |
| `status` | same values | same values (`PENDING` … `CANCELLED`) |
| `confirmBy` | mock | `deadlines.confirmBy`; payment countdown from `deadlines.paymentDueAt` (24 h after confirmation, D2) |
| `timeline[]` | `{status, at}` | `history[]` `{ status, changedBy, note, changedAt }` (detail only); `timestamps` on every order |
| `paymentMethod` (`MOMO`, `ZALOPAY`, `CARD`) | radio in `PaymentDialog` | `paymentProvider`: **`MOMO` or `ZALOPAY` only** (database CHECK). Remove `CARD` from `PAYMENT_METHODS`. |
| `listOrders({ role })` | all | `GET /api/orders?role=buyer|seller&size=50` (paged; `status` filter = `ORDER_FILTERS` statuses) |
| `getOrder(id)` / `getOrders(ids)` | | `GET /api/orders/{id}` (404 → null) / `GET /api/orders/by-ids?ids=` |
| `getActionCounts()` | | `GET /api/orders/action-counts` → `{ buyer, seller }` (same statuses as `NEEDS_ACTION`) |
| `confirmOrder` / `declineOrder` / `cancelOrder` | | `POST /api/orders/{id}/confirm` / `…/cancel` (seller: decline) / `…/cancel` (buyer) |
| `payOrder(id, method)` | marks PAID | **Two steps**: `POST /api/orders/{id}/payments {provider}` → attempt; then (sandbox) `POST {simulatorUrl} {outcome: "SUCCESS"}` → order. The order is PAID only after the verified result. Keep the dialog's "Demo payment: simulated" notice whenever `sandbox` is true; show the simulator only when `simulatorUrl` is present (see ORDERS_API "Simulated vs real payments"). Handle `CONTINUE_PAYMENT` (an attempt in progress) and 409 `ORDER_DEADLINE_PASSED`. |
| `markDelivering(id)` | | `POST /api/orders/{id}/ship` (optional `carrier`, `trackingNumber`) |
| `confirmReceived(id)` | | `POST /api/orders/{id}/confirm-receipt`; 409 `ORDER_DISPUTED` while a dispute is open |
| (new) report a problem | – | `POST /api/orders/{id}/disputes {reason}` when `actions` has `OPEN_DISPUTE` |
| `simulateOtherParty`, `resetSampleData` | sample mode | Not available with the real API (the other person acts in their own account). |
| Buttons | computed in `orderFlow.js` | `actions[]` (`CONFIRM`, `CANCEL`, `PAY`, `CONTINUE_PAYMENT`, `SHIP`, `CONFIRM_RECEIPT`, `OPEN_DISPUTE`) |
| 30-second polling (Q4) | | unchanged: poll `GET /api/orders/{id}` and `/action-counts` |

Error handling for the checkout page: 409 `LISTING_UNAVAILABLE` (`fieldErrors[].field = "productIds[<id>]"`,
message = reason) → mark those items and reload the cart; 409 `OWN_LISTING`; 409 `PRICE_CHANGED`; on a network timeout
do **not** resubmit blindly: reload `GET /api/orders?role=buyer` first (a resubmission of the same listings is refused
with 409, it never creates a second order; its `fieldErrors` contain `ALREADY_IN_YOUR_ORDER` and `existingOrderIds`). Money: integers in VND, format with the existing `formatPrice` (`utils/format.js`).

## 3.5 Admin, reviews, reports, promotions and contact integration (Backend Stage 5)

The API is implemented and tested (`docs/ADMIN_API.md`); the frontend still uses `mockAdminApi.js` and
`mockAccountApi.js`. No frontend code was changed in Stage 5. All `/api/admin/**` calls need an ADMIN token
(students get 403).

| Frontend function | Mock today | Real API / mapping |
|---|---|---|
| `adminApi.getOverview({ campus })` | sample stats + illustrative trends | `GET /api/admin/dashboard?from=&to=`. Cards: `users.students`, `listings.publicAvailable`, `listings.pendingModeration`, `finance.completedOrders`, `reports.open`. "Total revenue" must use `finance.commissionRevenue` (platform revenue) — `finance.grossMerchandiseValue` is completed order value, `buyerPaidTotal` includes the seller's delivery fees. `verifiedUsers` → `users.studentAccountsWithEmailVerified` and label it "email-verified accounts" (not "verified students"). **No trend series** exist: hide the sparklines or drop `trends`. `campus` filter: pilot has one campus, not supported. Label figures as simulated while `finance.sandboxOrders` equals `completedOrders`. |
| `getBadgeCounts()` | | `GET /api/admin/badges` → `pendingListings`, `openReports` (+ `openDisputes`, `pendingSettlements`); admin name from `GET /api/auth/me` |
| `listListings({ q, moderation, page, pageSize })` | | `GET /api/admin/listings?moderation=&q=&page=&size=`; `counts` → `GET /api/admin/listings/counts`. Item: `seller{id,name}`, `openReports`, `mainImageUrl`, `version`. `category` / `campus` filters not supported. |
| `approveListing(id)` | preview | `POST /api/admin/listings/{id}/approve { version }` — send the `version` shown; on 409 `LISTING_CHANGED` reload and review again |
| `blockListing(id, reason)` | preview | PENDING listing: `POST …/reject { version, reason }`; APPROVED listing: `POST …/block { reason }` |
| `removeListing(id, reason)` | preview | `POST /api/admin/listings/{id}/remove { reason }` (409 for reserved/sold, as in the mock) |
| `listUsers({ q, status, verification, page })` | | `GET /api/admin/users?q=&status=&role=STUDENT`. `verification` (VERIFIED / EMAIL / UNVERIFIED) has no backend meaning while student verification is pending: show `emailVerified` only. `listingCount`, `rating{average→ratingAverage,count→ratingCount}`, `openReports` provided. |
| `suspendUser(id, reason)` / `reactivateUser(id)` | preview | `POST /api/admin/users/{id}/suspend { reason }` / `…/reactivate` |
| `listReports({ status, targetType })` | | `GET /api/admin/reports?status=&targetType=`. Mock `OPEN` ≈ API `ACTIVE` (Open + Reviewing). Target type `LISTING`/`USER`; `target{type,id,label,status,owner}`, `reporter`, `reasonCode` (= `REPORT_REASONS` value), `details`, code `RP-<id>`. |
| `resolveReport(id, resolution)` / `dismissReport` | preview | `POST /api/admin/reports/{id}/resolve` / `…/dismiss { resolution }` (optional `…/review` first) |
| `listOrders({ status })` | | `GET /api/admin/orders?status=` (read only, Stage 4 order view) |
| `listCategories` | | `GET /api/categories` (counts); no admin category management yet |
| `exportReport` | preview | not implemented |
| (new screens) disputes, settlements | – | `/api/admin/disputes…`, `/api/admin/settlements…` (see ADMIN_API 6–7). Always show "No money is moved by UniMarket — enter the reference of the transfer you made". |
| `accountApi.getUserProfile(id)` | | `GET /api/users/{id}` (public: name, campus, `emailVerified`, memberSince, rating, activeListings, `contact` when shared). `programme`, `bio` do not exist in the database. |
| `getMyProfile()` / `updateProfile()` | | name/email: `GET /api/auth/me`; contact: `GET`/`PUT /api/me/contact { phone, zaloUrl, showContact }`. Other profile fields not supported. |
| `getRatingSummary(id)` | `{ average, count, distribution }` | `GET /api/users/{id}/ratings` (same fields; `average` has two decimals) |
| `listUserReviews(id, { role })` | | `GET /api/users/{id}/reviews?role=SELLER|BUYER` (mock `BUYER` = written by buyers = API `SELLER`) |
| `getOrderReviews(orderId)` | `{ canReview, mine, theirs }` | `GET /api/orders/{id}/reviews` (same shape) |
| `submitReview({ orderId, rating, comment })` | | `POST /api/orders/{id}/reviews { rating, comment }` (≤ 500 chars, same as `REVIEW_COMMENT_MAX`) |
| `createReport({ targetType, targetId, reason, details })` | | `POST /api/reports` (same fields; `targetType` `LISTING`/`USER`) |
| Seller: why was my listing blocked? | `moderation` only | `GET /api/me/products/{id}/moderation` → reasons |
| Seller: promote a listing | – | `GET /api/promotion-packages`, `POST /api/products/{id}/promotions { packageId, provider }`, then (sandbox) `POST {simulatorUrl} { outcome }`; label "Simulated payment" while `sandbox` is true. Product cards keep using `featured`. |

Verification badges (team decision, Nov 2026): registration uses any email + OTP; the code proves email ownership,
not enrolment. The backend has no verified-student flag and the frontend no longer shows "Verified student"
anywhere: only "Email verified" (from `emailVerified`). Dashboard: `users.studentAccountsWithEmailVerified`;
admin private contact: `POST /api/admin/users/{id}/contact-access { purpose }` (audited); sandbox settlement release
needs `acknowledgeSimulated: true` and shows `payoutRecordType`; settlement totals are split real vs sandbox.

## 3.6 Stage 6 readiness notes (Nov 2026 review)

| Area | Ready to integrate? | Notes |
|---|---|---|
| Registration / login / OTP | Yes, with a campus select | Any email; `campusId` required. Non-FPT students blocked by data (V003 proposal). |
| Catalog, product page, images | Yes | Demo photos need placeholders (handled by `ImageSlot`). |
| Listing moderation | Yes | Admin approves with `version`. |
| Cart, checkout, orders | Yes | Shipping fee provisional (configured flat fee). |
| Payments | Yes, sandbox only | Label as simulated; no real provider. |
| Reviews, reports, disputes, settlements, promotions, dashboard | Yes | Settlement / promotion payments are sandbox records. |
| Shipping quotes | No | Carrier integration not implemented; details pending. |

## 3.7 V003 contract changes (V003 applied to `UniMarketJava` on 2026-11-03)

The full screen-by-screen mapping (registration with campus or typed university, pickup / delivery areas, carrier
choice, "Free (≤ 3 km)", per-seller fees, quote expiry and refresh, unavailable groups, legacy orders, simulated Bank
QR screen) is in `database/docs/V003_DESIGN_nationwide_and_simulated_shipping.md`, section 12. API details:
`AUTH_API.md` (registration), `PRODUCTS_API.md` (zones, `pickupZoneId`), `ORDERS_API.md` (quotes, checkout, BankQR).
Rows 3.2 / 3.4 / 3.6 above that say "`campusId` required" or describe `CHECKOUT_SHIPPING_FEE` describe the pre-V003
contract.

## 3.8 Stage 6.1 — authentication and profile integration (frontend)

Connected: registration, email verification (OTP), sign-in, session restore, profile and sign-out. Products, cart,
checkout, shipping quotes, payments, admin data, reviews and reports still use sample data (Stage 6.2+).

### Configuration (`UniMarket-Frontend/.env.local`, git-ignored; template `.env.example`)

| Variable | Meaning |
|---|---|
| `VITE_BACKEND_URL` | target of the Vite dev / preview proxy for `/api` (default `http://localhost:8080`). For integration tests use the **isolated** backend: `http://localhost:8081` → database `UniMarketJava_V003Test`. The dev server prints `[unimarket] /api -> <url>` when it starts. |
| `VITE_API_BASE_URL` | API base URL in the browser, default `/api` (same origin through the proxy, so no CORS change was needed). An absolute URL requires the frontend origin in the backend's `CORS_ALLOWED_ORIGINS` (already `http://localhost:5173`). |
| `VITE_AUTH_MODE` | `backend` = real auth; `demo` = previous preview (sample student, nothing sent). Default: `demo` while sample data is on (plain `npm run dev`), otherwise `backend`. In `backend` mode there is **no** mock-auth fallback. |

### Code

| File | Role |
|---|---|
| `src/config/apiConfig.js` | base URL, 15 s timeout, auth mode |
| `src/services/apiClient.js` | Axios instance: JSON, `Authorization: Bearer` when signed in, every failure rejected as `ApiError`; a 401 on a request that carried a token ends the session |
| `src/services/apiError.js` | `ApiError { kind: http/network/timeout, status, code, message, fieldErrors, retryAfterSeconds }` from the backend error body; proxy 502/503/504 = "can't reach UniMarket"; non-JSON bodies are never shown |
| `src/utils/apiErrorMessage.js` | user-facing title / text for network, timeout, 429 and 5xx |
| `src/services/auth/authApi.js` | `register`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`, `login`, `me`; reference data `GET /api/campuses`, `GET /api/locations/zones`, public profile `GET /api/users/{id}` |
| `src/services/auth/tokenStore.js` | token + expiry only (see below) |
| `src/services/auth/session.js`, `src/hooks/useSession.js` | `restoring / authenticated / anonymous`; restore on page load with `GET /api/auth/me`; sign-in = login + `/me`; `signInWithToken` (token from verify-email, also checked with `/me`); sign-out; follows other tabs |
| `src/services/auth/viewerProfile.js` | `/me` (+ public profile) → profile shape of the header / profile card; unknown numbers stay `null` ("–") |
| `src/hooks/useViewer.js` | real session in backend mode, demo student only in demo mode |
| `src/components/auth/RequireAuth.jsx` | guard: sell, my listings, checkout, orders, messages, profile, shop and settings need a session (→ `/login?next=…`); `/admin` needs role `ADMIN` from `/me` |
| `src/pages/auth/RegisterPage.jsx`, `src/components/auth/AffiliationFields.jsx` | registration with exactly one affiliation |
| `src/pages/auth/VerifyEmailPage.jsx` | `/verify-email?email=`: 6-digit code, expiry, resend countdown, "Remember me", automatic sign-in |
| `src/pages/auth/ForgotPasswordPage.jsx` | `/forgot-password?email=`: email → e-mailed code + new password → login page |
| `src/pages/auth/LoginPage.jsx` | sign-in, error messages, "Remember me", role-based landing |
| `ProfilePage.jsx`, `ProfileCard.jsx`, `SettingsPage.jsx`, `AccountMenu.jsx`, `Header.jsx` | real profile and sign-out |

### Flow

1. **Register** (`POST /api/auth/register`): full name (2–150), any valid email (≤ 254, no domain rule), password
   (8–72 characters, ≤ 72 UTF-8 bytes, a letter and a digit) and **exactly one** affiliation: an official campus
   (`campusId`, list from `GET /api/campuses`) **or** a typed university / college name (`universityName`, 2–200,
   shown as "self-declared"). Nothing is pre-selected; FPT Hoa Lac is never assigned automatically; the request never
   contains both. The form no longer asks for a home area (`homeZoneId` is never sent; the backend still accepts it).
   Server errors appear on their fields: `EMAIL_ALREADY_REGISTERED` → email (+ "Sign in instead"), `INVALID_CAMPUS` → campus,
   `affiliationProvided` / `universityNameLongEnough` / `password` field errors.
2. **Verify** (`/verify-email`): `POST /api/auth/verify-email`; expiry shown from `codeExpiresAt`; resend
   (`POST /api/auth/resend-verification`, always 202) disabled for 60 s after a code was sent (backend: 1 per 60 s,
   5 per hour); `INVALID_VERIFICATION_CODE` (wrong, expired, used or replaced code) and `TOO_MANY_ATTEMPTS`
   (5 wrong codes) are explained. A valid code returns a token: the page checks it with `/me`, stores it like a login
   ("Remember me" → `localStorage`) and redirects (`?next=`, else `ADMIN` → `/admin`, students → home). If that sign-in
   step fails, the page falls back to "Continue to sign in".
3a. **Forgot password** (`/forgot-password`, link on the login page, pre-filled with the typed email):
   `POST /api/auth/forgot-password` (always 202, never says whether the email exists; 503 `EMAIL_DELIVERY_FAILED` shown as
   a retry message), then code + new password + confirmation → `POST /api/auth/reset-password`
   (`INVALID_RESET_CODE`, `TOO_MANY_ATTEMPTS`, field errors). Success → `/login?email=` with "Your password has been
   changed". Resend countdown 60 s, 5 codes per hour.
3. **Sign in** (`POST /api/auth/login`, then `GET /api/auth/me`): `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` (link to
   the verification page), `ACCOUNT_DISABLED`, `TOO_MANY_ATTEMPTS` (5 failures / 15 min), network and 5xx messages.
   Landing: `?next=` (same-site paths only), else `ADMIN` → `/admin`, students → home.
4. **Session**: every page load re-validates the token with `/me`; an expired or rejected token (401) signs out quietly
   and the login page says the session ended. The UI never trusts a stored role or profile.
5. **Profile** (`/profile`): `/me` re-read on each visit, plus rating and active listings from `GET /api/users/{id}`
   (students). Shows the official "university · campus" or "name (self-declared)", the home area, "Email verified" only
   when `emailVerified` is true, never "verified student". Editing and reviews are hidden until they are connected.
6. **Sign out**: account menu or Settings → token and user forgotten in this browser, back to home. There is **no backend
   logout endpoint** (stateless JWT): the token stays valid on the server until it expires (1 h).

### Token storage (academic MVP — not production-grade)

Only `{ token, expiresAt }` is stored: `sessionStorage` by default (survives a refresh, cleared with the tab), or
`localStorage` with "Remember me". Web storage is readable by any script on the origin (XSS risk). Production would use
a short-lived in-memory access token plus an HttpOnly, Secure, SameSite refresh cookie, token revocation and refresh —
all of which need backend work. The frontend never logs the token, password or OTP.

### OTP in development

With `MAIL_MODE=smtp` (Gmail SMTP, `unimarket.demo@gmail.com` with a Google App Password) the code arrives in the student's inbox. Without it, the `dev`
profile uses `MAIL_MODE=log`: the email, including the code, is written to the backend log and never returned
by the API. For the isolated backend on 8081, read its log (`[DEV E-MAIL, not sent] to=<email>` followed by
`Your UniMarket verification code is: NNNNNN`). There is intentionally no endpoint that returns codes.

### Manual test environment

Frontend `.env.local`: `VITE_BACKEND_URL=http://localhost:8081`, `VITE_AUTH_MODE=backend`. Backend started with
`SERVER_PORT=8081`, `DB_URL=…databaseName=UniMarketJava_V003Test…`, `MAIL_MODE=log`, `ORDER_EXPIRY_ENABLED=false`.
Open `http://localhost:5173/register`.

### Real OTP e-mails (Gmail SMTP) and the university directory (Stage 6.1 enhancement)

- **E-mail**: backend `MAIL_MODE=smtp` sends the Vietnamese verification e-mail through Gmail SMTP
  (`smtp.gmail.com:587`, STARTTLS; `MAIL_USERNAME`, `MAIL_PASSWORD` = Google App Password, `MAIL_FROM`; see
  `AUTH_API.md`). No custom domain is used. The frontend never sees the credentials.
  `POST /api/auth/register` returns `emailDelivery` (`SENT` / `LOGGED` / `FAILED`); the verification page shows
  "check your inbox", the development note, or "account created but the e-mail could not be sent — request a new code
  after the countdown". `resend-verification` may answer 503 `EMAIL_DELIVERY_FAILED`, shown as a retry message.
  A duplicate registration (409) links to sign-in and to the verification page ("Not verified yet? Get a new code").
- **Directory**: `src/data/vnHigherEducationDirectory.json` (230 institutions from the Ministry's list of
  quality-recognised institutions, updated 30/9/2026; source and limits in `src/data/README.md`), loaded lazily as its
  own chunk. `UniversityPicker` is an accessible combobox (type with or without accents, ↑/↓, Enter, Esc) offering:
  official UniMarket campuses → `campusId`; directory entries → canonical name as `universityName` (self-declared);
  "My university is not listed" → free text `universityName`. Never both fields.

### Known limitations / remaining for Stage 6.2+

- Password reset by e-mailed code exists; changing the password while signed in and profile / contact editing do not (backend contact settings exist; the UI is not connected).
- Reviews, reports, cart, checkout, shipping quotes, payments (MoMo / ZaloPay / BankQR) and the admin
  workspace still use sample data even when signed in for real; admin data must move to `/api/admin/**`.
- No refresh token: after 1 h the user is signed out on the next API call.
- Login lockout is per backend instance and in memory (a restart clears it).
- No frontend test runner is configured; logic was checked with Node scripts, API flows through the Vite proxy.

## 3.9 Stage 6.2 — products, search, listings and favorites (frontend)

### Data source switch

| Variable (`UniMarket-Frontend/.env.local`) | Effect |
|---|---|
| `VITE_USE_MOCK_PRODUCTS=false` | catalog, product page, Sell / Edit, My listings and Saved items use the real API |
| not set | real API when `VITE_AUTH_MODE=backend`, otherwise it follows `VITE_USE_MOCK_DATA` |

`vite.config.js` resolves `@product-api-impl` with this switch; cart, checkout, orders, public profiles / reviews and
the admin workspace keep following `VITE_USE_MOCK_DATA` (out of scope until Stage 6.3+). The dev / preview proxy now
forwards `/media` (uploaded photos) to the backend as well as `/api`.

### Code

| File | Role |
|---|---|
| `src/services/products/productApi.js` | real implementation of the product service (same functions as `mocks/mockProductApi.js`) |
| `src/services/products/productMapper.js` | API JSON → card / page shape (`locationLabel`, `imageItems`, seller affiliation), facets, backend field errors → form fields |
| `src/services/products/catalogReference.js`, `src/hooks/useCatalogReference.js` | `GET /api/categories`, `/api/campuses`, `/api/locations/zones`, loaded once and shared; design icons / names added by slug |
| `src/constants/categorySlugs.js` | backend slug ↔ design slug (`dormitory-items` ↔ `dorm-items`, `study-equipment` ↔ `study-gear`) |
| `src/services/saved/favoritesStore.js`, `src/hooks/useSaved.js` | favorites from `GET/PUT/DELETE /api/me/favorites` (optimistic, rolled back on error); browser list only with sample data |
| `useCatalogParams`, `ProductFilters`, `ActiveFilterChips` | URL filters incl. `province` and `zone`; one campus at a time |
| `ProductForm`, `useListingSubmit`, `CreateListingPage`, `EditListingPage`, `MyListingsPage` | real create / edit / delete with photo upload |

### Behaviour

- **Catalog** (`/marketplace`, homepage sections, deals, related items): `GET /api/products` with `q`, `categoryId`,
  `condition`, `campusId`, `zoneId`, `province`, `minPrice`, `maxPrice`, `sort`, `page`, `size` (9). The backend
  filters, counts and pages the whole catalog (only Available + Approved listings of active sellers); the frontend
  never filters a page locally. Any filter change returns to page 1 (stable sort by id, so no duplicates across
  pages). Unknown category / campus values in old links match nothing ("No items match") instead of showing everything.
  Keyword search runs on submit from the header search bar (one request per search, no request per keystroke).
- **Product page**: `GET /api/products/{id}` (token sent when signed in). 404 or a non-numeric id → "Listing not
  found". Reserved / sold listings show their status and cannot be bought. The seller block shows name, "Email
  verified", rating from the response, official "University · Campus" or "University (self-declared)", member since.
  `seller.contact` is not displayed (not part of the existing layout). Owners see their pending / blocked listing
  with the moderation badge.
- **Sell** (`/sell`, sign-in required): `POST /api/products` multipart (`listing` JSON + `photos`). Categories from the
  API. Seller with an official campus: campus of their university (default their campus) + optional pickup area.
  Seller without a campus (self-declared university, V003): pickup area **required**, no campus sent; default = home area.
  Photo checks before upload (JPG/PNG/WebP, ≤ 5 MB, ≤ 8) and again on the server (magic bytes); server field / photo
  errors appear on their fields; upload progress is shown; the button is disabled while sending. Success → My listings
  with "pending review"; the listing is not public until an admin approves it.
- **Edit** (`/my-listings/:id/edit`): owner view of `GET /api/products/{id}`; `PUT` for the fields, then photo changes
  (delete removed, upload new, reorder) in an order that keeps 1–8 photos at every step. Every change returns the
  listing to PENDING. If a photo step fails after the fields were saved, the page says "Partly saved".
  Not editable (`editable: false`, sold / reserved / open order) → explained, no form.
- **My listings**: `GET /api/me/products` (all own listings except removed, with moderation). Edit / Delete only when
  `editable`. Delete = `DELETE /api/products/{id}` (soft: `Status = Removed`, rows and photos kept).
- **Saved items**: hearts on cards and the product page call `PUT` / `DELETE /api/me/favorites/{id}`; visitors are sent
  to `/login?next=…`. State is loaded per account when the session starts and cleared on sign-out, so accounts never
  share hearts. `/saved` lists `GET /api/me/favorites` (only listings that are still public).

### API gaps found (not changed)

| Gap | Effect |
|---|---|
| The rejection / block reason is not part of the product responses | the frontend reads it from `GET /api/me/products/{id}/moderation` (Stage 5) for the seller's blocked listings |
| `campusId` filter accepts one campus | the campus filter is single-select |
| Photos are not re-encoded | EXIF metadata (e.g. GPS) of uploaded photos is kept (see PRODUCTS_API.md storage audit) |
| Demo photos `/images/demo/products/*.svg` do not exist | demo listings show the placeholder |
| Cart / checkout / orders still sample data | "Add to cart" / "Buy now" on real listings lead to the sample checkout, which cannot order them (Stage 6.3) |

### Manual test (browser)

1. Backend on **8081** with `DB_URL=…databaseName=UniMarketJava_V003Test…`, `ORDER_EXPIRY_ENABLED=false`,
   `MAIL_MODE=log` (or `smtp`). Frontend `.env.local`: `VITE_BACKEND_URL=http://localhost:8081`, `VITE_AUTH_MODE=backend`
   (real products follow automatically). `npm run dev` → <http://localhost:5173>.
2. Sign in (or register + OTP) with a test account. A self-declared account tests the "pickup area required" path.
3. **Sell an item**: fill the form, add 1–8 photos, publish → My listings shows it as "Pending review".
4. Pending check: the marketplace and a signed-out window do not show it; its own page opens for the seller only.
5. **Approve it through the Stage 5 Admin API** (business rules, stale-version protection and the `AdminActions` audit
   row; never by editing `ModerationStatus` in SQL). The admin UI is not connected yet, so use the helper script (no
   Postman needed):
   `powershell -ExecutionPolicy Bypass -File UniMarket-Backend\docs\scripts\approve-listing.ps1 -ProductId <id>`
   It signs in as an ADMIN of the test copy (default `demo.admin@fpt.edu.vn`; password typed hidden, from the team),
   reads `GET /api/admin/listings/{id}` for its `version`, then calls `POST /api/admin/listings/{id}/approve`
   `{ "version": "…" }`. Add `-Reject -Reason "…"` (10–1000 characters) to test a rejection: the seller then sees
   "Blocked" with the admin's reason in My listings / Edit (from `GET /api/me/products/{id}/moderation`).
   Calls go through `http://localhost:5173/api`, i.e. the isolated backend 8081. The listing then appears in the
   marketplace and search.
6. Filters: category, price, condition, campus, province / area, sort, pages; open a filtered URL in a new tab.
7. Heart a listing, reload, check `/saved`; sign out → hearts empty; another account has its own list.
8. My listings: edit (photos, price), delete (confirmation).

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
