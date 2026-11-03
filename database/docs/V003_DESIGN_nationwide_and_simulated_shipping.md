# V003 – nationwide registration and simulated shipping (final design for review)

Written for: the team members who approve schema changes, and the backend / frontend developers who will build them.

Status (2026-11-03): **tested on isolated copies only; NOT EXECUTED on `UniMarketJava`.** Applied to
`UniMarketJava_V003Test` (full backend suite + SQL tests) and to `UniMarketJava_V003RollbackTest` (apply → rollback →
identical schema). Results: section 11. Applying it to the real database needs a separate, explicit approval.

| File | Content |
|---|---|
| `database/migrations/V003__nationwide_registration_and_simulated_shipping.sql` | migration (guarded: runs only with `-v Approved="YES"`) |
| `database/migrations/V003_rollback.sql` | reverse script (refuses once V003-format data exists) |
| `database/tests/create_test_copy.sql` | COPY_ONLY backup + `RESTORE VERIFYONLY` + restore under a new *Test name |
| `database/tests/V003_checkout_with_shipping_tests.sql` | SQL-level tests of `usp_CheckoutWithShipping` (errors, rollback, 266, result sets) |
| `database/tests/V003_financial_checks.sql` | read-only money / history invariants after a test run |

Both scripts were executed on isolated copies (section 11); parse-only checks were not relied on.

---

## 1. Revised architecture

```
Users ──CampusId (NULL)──► Campuses ──ZoneId──► LocationZones ◄──PickupZoneId── Products ──CampusId (NULL)──► Campuses
  │  DeclaredUniversityName (free text, unverified)                                   ▲
  └─ HomeZoneId (optional default area) ──────────────► LocationZones                  │
Orders (V002, unchanged money) ◄── OrderShippingQuotes (1:1, simulated): Carrier, PickupZoneId, DeliveryZoneId,
                                                         DistanceKm, Fee (= Orders.ShippingFee), FormulaVersion
usp_CheckoutWithShipping ──wraps──► usp_Checkout (V002, unchanged) + per-seller ShippingFee + quote rows
```

### 1.1 Registration
- Any valid email + OTP (unchanged).
- Affiliation: **either** an official campus (`campusId`, validated FK) **or** a free-text university / college name
  (`DeclaredUniversityName`, 2–200 characters, trimmed). Enforced by `CK_Users_Affiliation` (admins exempt).
- Free text is never inserted into `Universities`; `DeclaredUniversityKey` (normalised, persisted) is for reporting
  only. No automatic campus, no domain-based affiliation, no verified-student status or badge.
- Optional `HomeZoneId` (a `LocationZones` row) as the default pickup / delivery area.

### 1.2 Listing location
- `Products.CampusId` optional, `Products.PickupZoneId` optional, at least one (`CK_Products_Location`).
- Effective pickup zone = `PickupZoneId`, else the campus zone (`Campuses.ZoneId`; FPT Hoa Lac → `HN-HOA-LAC`).
- Seller without a campus: must choose a pickup zone. Seller with a campus: campus (of their university, Stage 3 rule)
  and/or a pickup zone.

### 1.3 Missing or unsupported locations

| Situation | Behaviour |
|---|---|
| Listing has no resolvable pickup zone (impossible after V003: CHECK + every campus has a zone) | quote 200 with the group `available: false`, `reason: "NO_PICKUP_AREA"`, no token; checkout 409 `SHIPPING_UNAVAILABLE` |
| Pickup zone deactivated later | listing stays visible; same as above until the seller picks an active zone |
| Delivery zone missing / unknown / inactive | 400 `INVALID_ZONE` (field `deliveryZoneId`) — also refused by the procedure (51060) |
| Distance beyond every carrier's maximum (e.g. Hà Nội → TP.HCM) | quote 200 with `available: false`, `reason: "OUT_OF_RANGE"`, no token; checkout 409 `SHIPPING_UNAVAILABLE` (whole checkout refused) |
| Quote token tampered, of another buyer / listing set / area / carrier | 400 `SHIPPING_QUOTE_INVALID` |
| Token expired (15 min), other formula version, or recomputed fee / distance / pickup differs | 409 `SHIPPING_QUOTE_CHANGED` — get a new quote |
| Seller group with items in different zones | quote uses the item zone farthest from the destination (conservative); the procedure checks the pickup zone belongs to that group |

### 1.4 Zones are approximations
Distances are **centre-to-centre straight-line distances × 1.3**, rounded up to 0.1 km. They are not road distances,
not addresses and not routes. Two places in the same zone count as 0 km. This is stated in the API
(`distanceMethod: "ZONE_CENTRE_APPROXIMATION"`) and in the UI. Implementation decision: the quote endpoint answers 200
with per-group availability (instead of 409) so the UI can show which seller cannot deliver; checkout still refuses.

---

## 2. SQL migration (summary — see the script)

0. Guards: approval variable, V002 present, V003 absent, objects absent; baseline (counts, money sums, row checksums,
   catalog rows) in a temp table; one transaction for all steps (`XACT_ABORT`, `:ON ERROR EXIT`).
1. `LocationZones` + 21 demo zones.
2. `Campuses.ZoneId` + FPT Hoa Lac → `HN-HOA-LAC`; refuses if any campus has no zone.
3. `Users.CampusId` NULL; `DeclaredUniversityName`, `HomeZoneId`, `DeclaredUniversityKey` (persisted);
   `CK_Users_Affiliation` (uses `COALESCE`: a CHECK whose result is UNKNOWN would otherwise pass).
4. `IX_ProductSearch` dropped / recreated (adds `PickupZoneId` as INCLUDE); `Products.CampusId` NULL; `PickupZoneId`;
   `CK_Products_Location`.
5. `vw_ProductCatalog`: `LEFT JOIN` campus and zone; same WHERE; columns appended (`PickupZoneId`, `PickupZoneName`,
   `PickupProvince`) so existing readers keep working.
6. `OrderShippingQuotes` with CHECKs: carrier list, distance 0–2000, fee 0–1 000 000, `DistanceKm > 3.0 OR Fee = 0`,
   `IsSimulated = 1` (a real carrier later needs its own migration).
7. `SellerShippingList` type + `usp_CheckoutWithShipping`.
8. Simulated Bank QR provider: the three V001 CHECKs that list `'MoMo','ZaloPay'` (`Orders.PaymentProvider`,
   `Payments.Provider`, `ProductPromotions.Provider`; system-named) are found by definition (exactly 3 expected),
   dropped and recreated WITH CHECK under explicit names allowing `'BankQR'`. No procedure changes: the V002 payment
   procedures take the provider as a parameter and compare it with the stored one; `varchar(10)` fits `BankQR`.
9. `SchemaMigrations` row; post-checks against the baseline (all existing rows, money totals and catalog rows
   unchanged; no NULL campus; no quote) → commit, otherwise rollback.

Guards (tested): `-v Approved="YES"` required; `TargetDb` must equal the connected database; connecting to
`UniMarketJava` additionally needs `ProductionApproval="YES"`; refuses a second run ("already applied").

Constraint names are explicit so the rollback can drop exactly what V003 added.

---

## 3. Initial location zones (demo dataset) — OpenStreetMap-sourced

**Verification (2026-11-03):** every reference point was taken from OpenStreetMap through the Nominatim search API
(© OpenStreetMap contributors, ODbL), one request per > 1 s as the usage policy requires; the source object is
recorded below and in the migration. The point is the centroid / representative point of that object (a ward
boundary, a campus or a landmark). **Limits:** these are approximate zone centres for simulated distances only — not
addresses, not delivery points, not official administrative boundaries (Vietnam merged wards / provinces in 2025;
names are areas). Ward names come from the current OSM data. Two codes were renamed after the check because the old
names no longer matched an area: `HCM-QUAN-10` → `HCM-LY-THUONG-KIET`, `DN-SON-TRA` → `DN-AN-HAI`. The first pass
(free-text district queries) produced wrong matches (e.g. "Đống Đa" → a railway station, "Quận 10" → a campus 19 km
away); those were re-queried with ward / campus names. No point is presented as verified beyond "matches the cited OSM
object".

| Code | Area | Province | Lat | Lon | OSM source |
|---|---|---|---|---|---|
| HN-HOA-LAC | Hòa Lạc (Khu CNC Hòa Lạc) | Hà Nội | 21.013528 | 105.525261 | way/800878327 (FPT University campus) |
| HN-CAU-GIAY | Cầu Giấy | Hà Nội | 21.028670 | 105.786604 | relation/19335053 (Phường Cầu Giấy) |
| HN-BACH-KHOA | Bách Khoa | Hà Nội | 21.005527 | 105.843593 | relation/16092230 (Hanoi University of Science and Technology) |
| HN-DONG-DA | Đống Đa | Hà Nội | 21.010730 | 105.818202 | relation/19331659 (Phường Đống Đa) |
| HN-HOAN-KIEM | Hoàn Kiếm | Hà Nội | 21.028831 | 105.852536 | relation/198437 (Hồ Hoàn Kiếm) |
| HN-THANH-XUAN | Thanh Xuân | Hà Nội | 20.998358 | 105.804240 | relation/19335051 (Phường Thanh Xuân) |
| HN-HA-DONG | Hà Đông | Hà Nội | 20.970219 | 105.774957 | node/11176220557 (Hà Đông station) |
| HCM-BEN-THANH | Bến Thành | TP.HCM | 10.772530 | 106.698037 | way/39514795 (Chợ Bến Thành) |
| HCM-LY-THUONG-KIET | Lý Thường Kiệt (Bách khoa) | TP.HCM | 10.773350 | 106.659632 | way/237665212 (HCMUT, 268 Lý Thường Kiệt) |
| HCM-BINH-THANH | Bình Thạnh | TP.HCM | 10.811181 | 106.703394 | relation/19260954 (Phường Bình Thạnh) |
| HCM-GO-VAP | Gò Vấp | TP.HCM | 10.838417 | 106.675343 | relation/19261094 (Phường Gò Vấp) |
| HCM-KHU-CNC | Khu Công nghệ cao | TP.HCM | 10.841417 | 106.810074 | way/1022939891 (FPT University HCMC) |
| HCM-LANG-DAI-HOC | Làng Đại học | TP.HCM | 10.882143 | 106.782565 | node/11562800202 (VNU-HCM dormitory B) |
| DN-HAI-CHAU | Hải Châu | Đà Nẵng | 16.058954 | 108.219484 | relation/13969677 (Phường Hải Châu) |
| DN-AN-HAI | An Hải | Đà Nẵng | 16.070062 | 108.236422 | relation/13996723 (Phường An Hải) |
| DN-NGU-HANH-SON | Ngũ Hành Sơn | Đà Nẵng | 15.967483 | 108.260361 | way/1058072008 (FPT University Da Nang) |
| DN-LIEN-CHIEU | Liên Chiểu (Hòa Khánh) | Đà Nẵng | 16.075016 | 108.152724 | way/968341228 (University of Science and Technology - UD) |
| CT-NINH-KIEU | Ninh Kiều | Cần Thơ | 10.033477 | 105.780409 | relation/13512464 (Phường Ninh Kiều) |
| CT-DH-CAN-THO | ĐH Cần Thơ (Khu II) | Cần Thơ | 10.032149 | 105.768305 | way/165716609 (Can Tho University campus II) |
| CT-AN-BINH | An Bình | Cần Thơ | 10.013490 | 105.731715 | way/1157134865 (FPT University Can Tho) |
| CT-BINH-THUY | Bình Thủy | Cần Thơ | 10.072194 | 105.752804 | relation/13514267 (Phường Bình Thủy) |

Adding / correcting zones later is a data change (admin script), not a schema change.

---

## 4. Shipping formula `SIM-2026-11` and boundary tests

**Independent of real providers:** constants live in backend configuration; no provider API, account, contract or
published tariff is used or claimed. Brand names are displayed as "GrabExpress (simulated)", "Ahamove (simulated)",
"Standard delivery (simulated)", **without logos**, with the disclaimer "Simulated estimate for the UniMarket academic
demo – not a quotation from or partnership with GrabExpress or Ahamove." Generic names can replace them by config.

1. `t` (tenths of km) = 0 if both zones are equal; else `ceil( round6( haversine × 1.3 ) × 10 )`.
   Rounding to 6 decimals first prevents float noise (e.g. 3.0000000001 → 3.1).
2. `t ≤ 30` (≤ 3.0 km) → **0 VND** for every carrier.
3. `t > max_c` → carrier unavailable.
4. else `fee = ceil( (base_c + perKm_c × (t − 30) / 10) / 1000 ) × 1000` — integer arithmetic only.

| Carrier | base | per km | max |
|---|---|---|---|
| `GRAB_EXPRESS_SIM` | 15 000 | 5 000 | 40.0 km |
| `AHAMOVE_SIM` | 13 000 | 4 500 | 40.0 km |
| `STANDARD_SIM` | 10 000 | 2 500 | 100.0 km |

Output of the reference implementation (scratch script, same algorithm):

| Distance | Grab | Ahamove | Standard |
|---|---|---|---|
| 0.0 / 2.9 / **3.0** | 0 | 0 | 0 |
| **3.1** | 16 000 | 14 000 | 11 000 |
| 5.2 | 26 000 | 23 000 | 16 000 |
| **40.0** | 200 000 | 180 000 | 103 000 |
| **40.1** | n/a | n/a | 103 000 |
| **100.0** | n/a | n/a | 253 000 |
| **100.1** | n/a | n/a | n/a |

Zone pairs with the OSM points above (same algorithm; the Java `ShippingCalculator` gives the same values — e.g. the
stored test quotes Hòa Lạc → Cầu Giấy are 35.4 km, 177 000 / 91 000 VND):

| Zone pair | Distance (km) | Grab | Ahamove | Standard |
|---|---|---|---|---|
| Hòa Lạc → Hòa Lạc | 0.0 | 0 | 0 | 0 |
| Đống Đa → Bách Khoa | 3.6 | 18 000 | 16 000 | 12 000 |
| Hoàn Kiếm → Bách Khoa | 3.6 | 18 000 | 16 000 | 12 000 |
| Cầu Giấy → Đống Đa | 5.0 | 25 000 | 22 000 | 15 000 |
| Hòa Lạc → Cầu Giấy | 35.4 | 177 000 | 159 000 | 91 000 |
| Hòa Lạc → Hà Đông | 34.3 | 172 000 | 154 000 | 89 000 |
| Hòa Lạc → Hoàn Kiếm | 44.3 | n/a | n/a | 114 000 |
| Bến Thành → Lý Thường Kiệt | 5.5 | 28 000 | 25 000 | 17 000 |
| Khu CNC → Làng Đại học | 7.1 | 36 000 | 32 000 | 21 000 |
| Bến Thành → Làng Đại học | 19.9 | 100 000 | 90 000 | 53 000 |
| Hải Châu → An Hải | 2.9 | 0 | 0 | 0 |
| Hải Châu → Liên Chiểu | 9.6 | 48 000 | 43 000 | 27 000 |
| Ninh Kiều → ĐH Cần Thơ | 1.8 | 0 | 0 | 0 |
| Ninh Kiều → An Bình | 7.6 | 38 000 | 34 000 | 22 000 |
| Hòa Lạc → Bến Thành | 1 489.3 | n/a | n/a | n/a |

Change against the earlier draft (approximate points): Đống Đa → Bách Khoa is now 3.6 km and therefore **paid**.

Note: the fee jumps from 0 to 11 000–16 000 VND at 3.1 km (a direct consequence of the free radius).

Unit tests: every row above; distance exactly at 3.0 / 40.0 / 100.0 with float noise; negative / NaN inputs
rejected; maximum fee ≤ 253 000 (DB bound 1 000 000); fees are multiples of 1 000; formula version stored.

---

## 5. Quotes bound to the checkout context

Fees are calculated **only on the backend**; the client never sends an amount that is used.

1. `POST /api/shipping/quotes { productIds, deliveryZoneId }` (signed in) returns, per seller group, the options and a
   **quote token**: HMAC-SHA256 (secret `SHIPPING_QUOTE_SECRET`) over
   `buyerId | sellerId | sorted productIds of that seller | pickupZoneId | deliveryZoneId | carrier | distanceTenths |
   fee | formulaVersion | expiresAt` (15 minutes). Nothing is stored.
2. `POST /api/checkout { …, deliveryZoneId, shipping: [{ sellerId, carrier, quoteToken }] }`. The backend, for each
   seller group of the selected listings:
   - verifies the signature, expiry, buyer (= token user), the group's exact product set, delivery zone, carrier and
     the current formula version;
   - **recomputes** distance and fee from the database; any difference → 409 `SHIPPING_QUOTE_CHANGED`;
   - missing / extra group or carrier unavailable → 400 / 409 `SHIPPING_UNAVAILABLE`.
3. It calls `usp_CheckoutWithShipping`, which re-checks bounds, the free radius, one quote per seller order and the
   pickup zone against the listings. A tampered or stale token can therefore never change an amount.

---

## 6. V002 compatibility assessment

`usp_CheckoutWithShipping` **calls** `usp_Checkout` instead of copying it, so the V002 logic exists once.

| V002 guarantee | How it is preserved |
|---|---|
| Multi-seller atomicity | one outer transaction around `usp_Checkout` + fee updates + quote inserts; any THROW rolls everything back (`XACT_ABORT`) |
| `UPDLOCK, HOLDLOCK` on listings | inside `usp_Checkout`, unchanged; held until the outer COMMIT (longer by a few statements) |
| Unique active order item | `UX_ActiveOrderItems_Product` unchanged; also used to identify the created orders |
| No self-purchase, quantity 1, price snapshots | `usp_Checkout` unchanged (51022, CHECK Quantity = 1, `OrderItems.UnitPrice/ProductTitle`) |
| Seller confirmation deadline | `Orders.ConfirmBy` default (CreatedAt + 24 h) unchanged |
| Buyer payment deadline | `PaymentDueAt` (ConfirmedAt + 24 h) unchanged |
| Money | only `Orders.ShippingFee` is set (≥ 0); `TotalAmount`, `CommissionAmount` (merchandise only), `SellerProceeds`, `SellerPayoutTotal` recompute as persisted computed columns before COMMIT |
| Payments / settlements | `usp_StartPayment` reads `TotalAmount` (includes the fee); `usp_CompleteOrder` copies `ShippingFee` into the settlement (D1) — unchanged procedures |
| Duplicate checkout | unchanged (listings Reserved → 51021 / unique index) |
| Free shipping | fee 0 ⇒ seller payout = merchandise proceeds; seller delivers within 3 km at their own cost |

Points that were open, now **proved on the isolated copy** (details in section 11):
- Nested transactions: a V002 error inside `usp_Checkout` (51021 reserved listing) and V003 errors after it succeeded
  (51062 missing quote, 51063 wrong pickup, 51061 fee inside 3 km) all reach the caller with their own number, with
  `@@TRANCOUNT = 0` afterwards and **no error 266**, both inside TRY/CATCH and in a raw call. Nothing remains: no
  order, quote, reservation or cart change (identity values are consumed — gaps in OrderId are normal).
- `ALTER COLUMN … NULL` succeeded with the system-named FKs (`FK__Users__CampusId__…`, `FK__Products__Campus__…`)
  and auto statistics (`_WA_Sys_…`) in place; all FKs and CHECKs are trusted afterwards.
- Result sets: `usp_Checkout`'s (OrderId, SellerId) set **is sent to the client even when a later check fails and
  everything is rolled back**. The backend therefore keeps only the LAST result set and only when no exception was
  raised (an error after the first set surfaces from `getMoreResults()`). `INSERT … EXEC` captures both sets (4 rows
  for 2 orders), so SQL callers must not use `INSERT … EXEC` to count orders.
- `usp_Checkout` stays callable. The backend no longer calls it (`OrderProcedures.checkout` removed); a direct call
  (scripts, old code) would create an order without a quote, shown as `LEGACY`. Revoking direct EXECUTE is a
  deployment option (not done: the app uses one login).

---

## 7. Checkout concurrency and atomicity test plan (isolated copy)

1. Two buyers, same listing, simultaneous `usp_CheckoutWithShipping` → one order, one quote, the other 51021; no orphan quote.
2. Multi-seller checkout where the second seller's listing becomes Reserved meanwhile → nothing created for either
   seller; first listing Available; cart unchanged; no quote rows.
3. Missing shipping row for one seller (51062), extra row, wrong pickup zone (51063), fee > 0 within 3 km (51061),
   inactive delivery zone (51060) → full rollback each time.
4. Seller edits the listing (Stage 3 lock) while checkout runs → exactly one wins; consistent state.
5. Repeated identical submission → second refused; one order; one quote.
6. Deadlock retry: forced deadlock victim (1205) → retried once, still all-or-nothing.
7. Money: per order, `TotalAmount = Subtotal + Fee`, commission unchanged by the fee, payout includes the fee;
   `OrderShippingQuotes.Fee = Orders.ShippingFee` for every order.
8. Expiry, payment start / callback, completion and settlement on orders with fee 0 and fee > 0.
9. Migration: post-checks pass; running twice refused; rollback works before V003 data and is refused after.

---

## 8. Frontend / backend contract changes

### Backend
| Area | Change |
|---|---|
| `POST /api/auth/register` | `campusId` optional; `universityName` (2–200); one of them required; optional `homeZoneId` |
| `GET /api/auth/me`, `GET /api/users/{id}` | `affiliation: { campusId?, campusName?, universityName, source: "OFFICIAL_CAMPUS" \| "SELF_DECLARED" }`; never a verified flag |
| `GET /api/locations/zones` | new, public: `[{ id, code, name, province }]` (no coordinates needed by the UI) |
| Listings | create / edit accept `campusId?`, `pickupZoneId?` (at least one); DTOs `location: { campus?, zone }` |
| Catalog | filters `zoneId`, `province`; campus / university filters unchanged |
| `POST /api/shipping/quotes` | new (see 5): per seller `{ sellerId, pickupZone, distanceKm, distanceMethod, free, options: [{ carrier, label, fee, available, quoteToken }] }`, `simulated: true`, `formulaVersion`, `disclaimer` |
| `POST /api/cart/validate` | + `deliveryZoneId`, chosen carriers → preview with fees and totals |
| `POST /api/checkout` | + `deliveryZoneId`, `shipping[]` with quote tokens; new errors `SHIPPING_QUOTE_CHANGED`, `SHIPPING_UNAVAILABLE` |
| Orders | `shipping: { carrier, label, distanceKm, pickupZone, deliveryZone, simulated, formulaVersion }`; legacy orders `source: "LEGACY"` |
| `shippingFeePolicy` | `method: "SIMULATED_DISTANCE"`, `freeRadiusKm: 3`, `simulated: true` |
| Removed | `CHECKOUT_SHIPPING_FEE` config; calls to `usp_Checkout` |
| New config | `SHIPPING_QUOTE_SECRET`, carrier constants, `formulaVersion` |

Code that must handle a NULL campus (found in Stages 2–5): `User` / `Product` entities (`nullable = false` →
optional), `UserResponse`, `ProductMapper` (`CampusRef.from` null), listing campus rule, `AdminUserService`,
`ReviewService.profile` and `ModerationService` queries (`JOIN Campuses` → `LEFT JOIN`), catalog facets (NULL campus
key), `ProductInsightsRepository` (view columns), Stage 3–5 tests.

**Backend implementation status (2026-11-03, uncommitted):** all rows above are implemented and tested, except
the catalog filters `zoneId` / `province` and `POST /api/cart/validate` with `deliveryZoneId` (the cart and its preview
now show shipping 0 with `shippingFeePolicy.included = false`; the quote endpoint gives the fees). `CHECKOUT_SHIPPING_FEE`
is removed. Errors: `INVALID_ZONE` (400), `SHIPPING_QUOTE_INVALID` (400), `SHIPPING_QUOTE_CHANGED` (409),
`SHIPPING_UNAVAILABLE` (409).

### Frontend
Register: university picker + "My school is not listed" free text (label "self-declared"), optional campus / area.
Listing form: pickup area select. Checkout: delivery area select, carrier per seller group, fee per group, grand total,
"Free (≤ 3 km)" badge, distance shown as "≈ x km (estimate)", disclaimer text, no provider logos. Order page: shipping
block. No verified-student badge anywhere.

---

## 9. Risk and rollback analysis

| Risk | Mitigation |
|---|---|
| Nested transaction / error 266 surprises | tested on the copy (plan 7); backend maps the first error number |
| Longer lock time during checkout | a few extra statements; concurrency tests 1, 4, 6 |
| Coordinates wrong | verification gate before approval; zones editable by data script |
| Users believe estimates are real prices | disclaimers in API and UI; `IsSimulated = 1` enforced |
| Free text abuse (offensive names) | length limits; reports / admin moderation; not shown as verified |
| Queries assuming a campus | code list in 8; full regression suite |
| Rollback after new data | impossible without inventing campuses → backup restore only |

Procedure: approval (design, zone list after verification, carrier constants, disclaimer wording) → full backup +
`RESTORE VERIFYONLY` → create isolated copy → run V003 → backend changes + full test suite + plan 7 → review →
apply to `UniMarketJava` → post-checks → never re-run V001 / V002.

---

## 10. Simulated e-wallet and Bank QR payments

**Audit (V001 / V002):**

| Assumption | Where | Change |
|---|---|---|
| Provider list `'MoMo','ZaloPay'` | 3 system-named CHECKs: `Orders.PaymentProvider`, `Payments.Provider`, `ProductPromotions.Provider` | recreated with `'BankQR'` (step 8) |
| Column sizes | `varchar(10)` | `BankQR` fits; none |
| `usp_StartPayment`, `usp_RecordPaymentResult`, promotion procedures | compare the parameter with the stored provider; no literal list | none |
| Unique references | `UX_PaymentReference` / `UX_PromotionReference` are per provider | none |
| Java API ↔ SQL | `OrderValues` uppercased the SQL value (`BankQR` → `BANKQR`) | explicit map `BANK_QR` ↔ `BankQR` |

**Flow (all simulated, no money moves):** buyer chooses `BANK_QR` at checkout or when paying → `POST
/api/orders/{id}/payments` creates the attempt with the exact `TotalAmount` (from the database) → the response carries
`bankQr: { qrPayload, reference, amount, simulated: true, notice }` where `qrPayload` is
`UNIMARKET-SIMULATED-PAYMENT|ref=UMDEMO-<order>-<payment>|amount=<VND>|NOT-A-BANK-QR` — deliberately **not** an
EMVCo / VietQR string, no bank, no account number → the frontend renders it as a QR image with the notice
"SIMULATED bank QR … do not transfer money" → the buyer finishes it on the dev-only simulator
(`/api/dev/payment-simulator/payments/{id}/complete`, buyer only) which sends an HMAC-signed notification through the same
verification as MoMo / ZaloPay → `usp_RecordPaymentResult` checks attempt, amount, provider, duplicates, deadline and the
30-minute grace → only then the order is Paid. There is no public mark-paid endpoint; the simulator is refused in
prod / production profiles. No claim of bank confirmation is made anywhere.

---

## 11. Isolated test results (2026-11-03)

| Item | Result |
|---|---|
| Copies | `UniMarketJava_V003Test`, `UniMarketJava_V003RollbackTest` from COPY_ONLY backups with checksums, `RESTORE VERIFYONLY` OK |
| Migration on V003Test | exit 0; post-checks: rows, money totals, row checksums and 35 catalog rows unchanged |
| Guards | wrong `TargetDb` refused; second run refused ("already applied"); rollback without approval / wrong target refused |
| Structure | nullable `CampusId` ×2; all FKs / CHECKs trusted; `IX_ProductSearch` recreated; stats intact; 21 zones; every catalog row has an area |
| SQL tests (`V003_checkout_with_shipping_tests.sql`) | T1–T8 PASS (51021 / 51062 / 51063 / 51061 / duplicate / CHECKs 547; no 266) |
| Backend suite on V003Test | 219 tests, 0 failures, 0 errors, 2 skipped (demo-password tests, env var not set) |
| Financial checks (`V003_financial_checks.sql`) | 0 violations on every V003 invariant; 137 quotes, 6 BankQR payments succeeded |
| Demo settlements 1–4 | `ShippingFee = 0`, `Amount = subtotal − commission`: created by the V001 `usp_CompleteOrder` (V001 paid out merchandise proceeds only) and deliberately kept by V002 step 5b (approved decision). Legitimate history, internally consistent (`CK_SellerSettlements_Amount` trusted). The financial check now reports them separately as "V001 legacy". |
| Encoding defect (found in the final review, fixed) | the UTF-8 migration run without `sqlcmd -f 65001` stored garbled zone names and still reported success. Added: a code-page guard before any change (`UNICODE(N'ầ') = 7847`) and a post-insert check on the stored names. Retested: refused without `-f 65001` (nothing changed); with it, schema 506/506 and zone data hash identical to V003Test; rollback identical to pre-V003. |
| Final script checksums | `database/migrations/V003.sha256` (migration `98585f47…`, rollback `6ef306dc…`) |
| Deployment | `V003_DEPLOYMENT_RUNBOOK.md`; read-only checks `database/validation/V003_pre_post_checks.sql` |
| Rollback before V003 data | apply → rollback on RollbackTest: 459/459 schema items identical to the pre-V003 database, same schema checksum and row counts. Two script defects found and fixed: the view was restored before `CampusId` was NOT NULL (column nullability wrong) and a comment inside the CREATE VIEW batch changed the stored text. Provider CHECKs come back under explicit names (same rule). |
| Rollback after V003 data | refused on V003Test, nothing changed |
| Real `UniMarketJava` | fingerprint identical before / after; migrations V001, V002 only |

---

## 12. Stage 6 frontend mapping

| Screen | API | UI requirement |
|---|---|---|
| Register | `GET /api/universities`, `GET /api/campuses`, `GET /api/locations/zones`, `POST /api/auth/register` | campus picker **or** "My school is not listed" free text (`universityName`, 2–200), never both; optional home area; error field `affiliationProvided`; label typed names "self-declared", no verified badge |
| Profile / seller card | `affiliation { campusId?, campusName?, universityName, source }`, `homeZone` | show source; never "verified student" |
| Listing form | `campusId?`, `pickupZoneId?` | seller without campus: pickup area required (field error `pickupZoneId`), campus hidden; seller with campus: optional area |
| Product card / page | `campus?`, `pickupZone` | show area name; campus may be absent |
| Cart | `shippingFeePolicy.included = false` | "Shipping is calculated after you choose a delivery area" — do not show 0 as free |
| Checkout | `POST /api/shipping/quotes` then `POST /api/checkout { deliveryZoneId, shipping: [{ sellerId, carrier, quoteToken }] }` | delivery-area select; one carrier choice per seller group; fee per group; "Free (≤ 3 km)" badge when `free`; distance as "≈ x km (estimate)"; disclaimer text; labels "(simulated)", no logos; unavailable groups with reason; never send an amount |
| Quote expiry | `expiresAt`, 409 `SHIPPING_QUOTE_CHANGED` | refresh quotes automatically before 15 min; on 409 re-quote and ask the buyer to confirm the new amount |
| Errors | `INVALID_ZONE`, `SHIPPING_QUOTE_INVALID`, `SHIPPING_UNAVAILABLE` | re-quote / change area / remove the seller's items |
| Order detail | `shipping { source, carrier, label, distanceKm, fee, pickupZone, deliveryZone, simulated, formulaVersion }` | `LEGACY` orders: show only the fee |
| Payment | providers `MOMO`, `ZALOPAY`, `BANK_QR` | BankQR: render `bankQr.qrPayload` as a QR image with the notice, the reference and the exact amount; "Simulated" watermark; the status changes only from the server (poll the order every 30 s) |
