# Cart, Checkout, Orders & Payments API (Backend Stage 4)

Written for: frontend and backend developers connecting the React app to the Spring Boot API.

All endpoints need a bearer token (`Authorization: Bearer <accessToken>`, Stage 2) except
`GET /api/products/by-ids` and the simulator's signed callback. Errors use the common `ApiErrorResponse`
(`code`, `message`, optional `fieldErrors[]`); branch on `code`. Money is whole VND (integers). Times are ISO-8601 UTC.

Every state change runs one V002 stored procedure (`usp_Checkout`, `usp_ConfirmOrder`, `usp_CancelOrder`,
`usp_StartPayment`, `usp_RecordPaymentResult`, `usp_ShipOrder`, `usp_CompleteOrder`, `usp_OpenOrderDispute`,
`usp_ExpirePendingOrders`). The procedures enforce the state machine, the locks and the money rules; the API adds
access checks and clear error codes. No schema change was made.

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/cart` | signed in | Cart grouped by seller, with delivery fees and unavailable listings |
| PUT | `/api/cart/items/{productId}` | signed in | Add (201) / already there (200) |
| DELETE | `/api/cart/items/{productId}` | signed in | Remove (204) |
| DELETE | `/api/cart` | signed in | Clear (204) |
| POST | `/api/cart/validate` | signed in | Check listings and prices before checkout |
| GET | `/api/products/by-ids?ids=1,2` | public | Several public listings, in request order (max 50) |
| POST | `/api/checkout` | signed in | Place the orders (one per seller) |
| GET | `/api/orders?role=buyer\|seller&status=&page=&size=` | signed in | My purchases / my sales |
| GET | `/api/orders/by-ids?ids=` | signed in | Orders by id (confirmation page) |
| GET | `/api/orders/action-counts` | signed in | `{buyer, seller}` orders waiting for me |
| GET | `/api/orders/{id}` | buyer, seller, admin | Order page |
| POST | `/api/orders/{id}/confirm` | seller | Confirm availability |
| POST | `/api/orders/{id}/cancel` | buyer or seller | Cancel / decline an unpaid order |
| POST | `/api/orders/{id}/payments` | buyer | Start (201) or resume (200) the online payment |
| POST | `/api/orders/{id}/ship` | seller | Hand to delivery |
| POST | `/api/orders/{id}/confirm-receipt` | buyer | Confirm receipt → completed |
| POST | `/api/orders/{id}/disputes` | buyer or seller | Ask an admin to review a paid order |
| POST | `/api/dev/payment-simulator/payments/{paymentId}/complete` | buyer | **Sandbox only**: finish a simulated payment |
| POST | `/api/dev/payment-simulator/callback` | signed notification | **Sandbox only**: simulated provider → server notification |

Strangers get **404** for an order (its existence is not revealed); the wrong side gets **403** (e.g. a buyer
calling `confirm`). Admins can read any order (`role: "ADMIN"`); admin actions come in the Admin stage.

---

## Order flow and statuses

```
checkout → PENDING ──seller confirm (≤ 24 h after the order)──► AWAITING_PAYMENT ──verified payment──► PAID
              │                                                   │ (buyer pays ≤ 24 h after confirmation)   │
              │ buyer cancel / seller decline / 24 h expiry        │ cancel / 24 h expiry                     seller ship
              ▼                                                   ▼                                          ▼
          CANCELLED                                            CANCELLED            COMPLETED ◄──buyer confirm receipt── DELIVERING
```

| API `status` | SQL `Orders.Status` | Listings |
|---|---|---|
| `PENDING` | `Pending` | Reserved |
| `AWAITING_PAYMENT` | `AwaitingPayment` | Reserved |
| `PAID` | `Paid` | Reserved |
| `DELIVERING` | `Delivering` | Reserved |
| `COMPLETED` | `Completed` | **Sold** |
| `CANCELLED` | `Cancelled` | back to Available |

Payment attempts: `PENDING`, `SUCCEEDED`, `FAILED`, `EXPIRED` (`Payments.Status`). Providers: `MOMO`, `ZALOPAY`
(the database allows only these two). Settlement: `PENDING` (calculated, owed, not paid) / `RELEASED` (an admin
confirmed a manual payout). Dispute: `OPEN` / `RESOLVED`, decision `NO_REFUND` / `REFUND_APPROVED`.

`actions` on every order lists what the viewer can do now: `CONFIRM`, `CANCEL`, `PAY`, `CONTINUE_PAYMENT`, `SHIP`,
`CONFIRM_RECEIPT`, `OPEN_DISPUTE`. It is a hint for buttons; the server checks again.

---

## Cart

```json
GET /api/cart
{
  "groups": [
    { "seller": { "id": 7, "fullName": "…" },
      "items": [ { "productId": 51, "title": "Desk lamp", "price": 100000, "imageUrl": "/media/products/….jpg",
                   "sellerId": 7, "status": "AVAILABLE", "purchasable": true, "addedAt": "2026-11-02T12:00:00Z" } ],
      "subtotal": 100000, "shippingFee": 0, "total": 100000 }
  ],
  "unavailable": [ { "productId": 52, "title": "…", "price": 60000, "status": "RESERVED", "purchasable": false, "reason": "RESERVED", … } ],
  "itemCount": 2, "subtotal": 100000, "shippingFee": 0, "total": 100000
}
```

- One group = one future order (one seller). `shippingFee` is the delivery fee of that order (see *Delivery fee*).
- `reason`: `RESERVED`, `SOLD`, `REMOVED`, `UNDER_REVIEW`, `SELLER_UNAVAILABLE`, `CATEGORY_UNAVAILABLE`, `OWN_LISTING`.
  Unavailable listings stay in the cart until removed.
- Add errors: 404 (unknown or not public), 409 `OWN_LISTING`, 409 `LISTING_UNAVAILABLE`, 400 `CART_FULL` (50 listings).
  The database trigger `trg_Cart_Validate` is the final guard.
- The cart has no price snapshot (`CartItems` has none). To detect a price change, send the prices the buyer saw:

```json
POST /api/cart/validate   { "productIds": [51, 52], "expectedPrices": { "51": 95000 } }
→ { "ready": false, "items": [ { "productId": 51, "price": 100000, "expectedPrice": 95000, "priceChanged": true, … }, … ] }
```

Body optional (default: the whole cart). Note: editing a listing puts it back to moderation (Stage 3), so a price can
only change on a listing that has become unavailable.

## Checkout

```json
POST /api/checkout
{ "productIds": [51, 60, 61], "recipientName": "Mai Vo", "recipientPhone": "0912 345 678",
  "deliveryAddress": "Dormitory C, room 214", "paymentProvider": "MOMO", "expectedPrices": { "51": 100000 } }
→ 201 { "orders": [ <order>, <order> ] }
```

| Field | Rule |
|---|---|
| `productIds` | 1–50, no duplicates (400). Can be the whole cart or a "Buy now" listing. |
| `recipientName` | 2–150 characters |
| `recipientPhone` | Vietnamese mobile number (same rule as the frontend); stored without spaces/dots |
| `deliveryAddress` | 5–500 characters |
| `paymentProvider` | optional, `MOMO` or `ZALOPAY` (can be chosen when paying) |
| `expectedPrices` | optional; any difference → 409 `PRICE_CHANGED` with `fieldErrors` per listing |

- Prices, sellers and availability come from the database, never from the request.
- **All or nothing**: the whole checkout is ONE `usp_Checkout` call = one database transaction, also with several
  sellers. If one listing fails, no order is created, nothing is reserved and the cart is unchanged.
- Errors: 409 `LISTING_UNAVAILABLE` (`fieldErrors`: `productIds[<id>]` → reason), 409 `OWN_LISTING`,
  409 `PRICE_CHANGED`, 400 `VALIDATION_FAILED`.
- Concurrency: two buyers → one wins, the other gets 409. A repeated or double-clicked submission cannot create a
  second active order (the listings are already Reserved; `usp_Checkout` locks them and the unique index on
  `vw_ActiveOrderItems` allows one active order per listing). It gets 409 `LISTING_UNAVAILABLE`.

#### Retry after a lost response (what is and is not guaranteed)

| Case | Result |
|---|---|
| First checkout succeeded, response lost, client retries the same listings | 409 `LISTING_UNAVAILABLE`; each listing in an order of this buyer has `fieldErrors[].message = "ALREADY_IN_YOUR_ORDER"`, plus `{ "field": "existingOrderIds", "message": "15,16" }`. Open those orders (`GET /api/orders/by-ids?ids=15,16`). |
| Two identical submissions at the same moment | One 201; the other 409 (from the pre-check, or `LISTING_UNAVAILABLE` without details if both passed it and the procedure refused the second). |
| Another buyer took the listing | 409 with `RESERVED` / `SOLD` (no order ids of others). |

**Not full idempotency:** a retry never returns the original 201 response, and a retry with a *different* selection
is a new checkout. True idempotency needs a key stored with the order (V003 proposal: `Orders.CheckoutKey` +
unique index, or a `CheckoutRequests` table) — **deferred, needs approval**. Frontend: on timeout or 409, do not
resubmit blindly; reload `GET /api/orders?role=buyer&status=PENDING` or use `existingOrderIds`.
- Ordered listings are removed from the cart. Each order: `ConfirmBy` = order time + 24 h.

## Order

```json
GET /api/orders/15
{
  "id": 15, "code": "UO-15", "status": "AWAITING_PAYMENT", "role": "BUYER",
  "buyer": { "id": 20, "fullName": "…" }, "seller": { "id": 7, "fullName": "…" },
  "items": [ { "productId": 51, "title": "Desk lamp", "unitPrice": 100000, "quantity": 1, "imageUrl": "…" } ],
  "amounts": { "subtotal": 100000, "shippingFee": 20000, "total": 120000 },
  "paymentProvider": "MOMO",
  "delivery": { "recipientName": "Mai Vo", "recipientPhone": "0912345678", "address": "Dormitory C, room 214" },
  "deadlines": { "confirmBy": "2026-11-03T12:00:00Z", "paymentDueAt": "2026-11-03T14:00:00Z" },
  "timestamps": { "createdAt": "…", "confirmedAt": "…" },
  "payments": [ { "id": 31, "provider": "MOMO", "status": "FAILED", "amount": 120000, "sandbox": true, "createdAt": "…", "finishedAt": "…" } ],
  "history": [ { "status": "PENDING", "changedBy": "BUYER", "changedAt": "…" }, { "status": "AWAITING_PAYMENT", "changedBy": "SELLER", "changedAt": "…" } ],
  "disputes": [],
  "actions": [ "PAY", "CANCEL" ]
}
```

- `items[].title` / `unitPrice` are **snapshots** taken at checkout; later listing changes do not affect the order.
- Lists (`GET /api/orders`) return the same object without `shipment`, `payments`, `history`, `disputes`, `settlement`,
  inside `{ items, page, size, totalItems, totalPages }` (1-based pages, size ≤ 50, newest first).
- `history[].changedBy`: `BUYER`, `SELLER`, `ADMIN`, `SYSTEM` (expiry job, payment provider). User ids are not shown.

### Who sees what

| Part | Buyer | Seller | Admin |
|---|---|---|---|
| subtotal, shippingFee, total | ✓ | ✓ | ✓ |
| commissionRate, commission, sellerProceeds, sellerPayout | – | ✓ | ✓ |
| delivery (recipient name, phone, address) | ✓ | **only PAID and DELIVERING** | ✓ |
| payments (status, provider, amount, sandbox) | ✓ | – (order status shows PAID) | ✓ |
| settlement | – | ✓ | ✓ |
| request key / provider reference | never | never | never |

**Recipient privacy.** The seller receives the buyer's delivery details (recipient name, phone, address) only after
the verified online payment and until delivery ends: status PAID or DELIVERING. Not while PENDING or
AWAITING_PAYMENT (confirming availability does not need them), not after COMPLETED, never for a CANCELLED order, and
the same in lists and on the order page. Basis: Business Plan 3.2 / 6.5 ("the seller arranges delivery after
successful online payment") and 6.7 (personal information only for authorised users); no approved requirement
conflicts. The seller always sees the buyer's account name (`buyer.fullName`). The buyer and admins always see the
delivery details. Strangers get 404 for the whole order.

### Money (D1, D4) – read from the database, never recalculated

| Field | Column | Rule |
|---|---|---|
| `subtotal` | `Orders.Subtotal` | sum of item price snapshots |
| `shippingFee` | `Orders.ShippingFee` | delivery fee, paid by the buyer, **all of it** goes to the seller |
| `total` | `Orders.TotalAmount` | subtotal + shippingFee — what the buyer pays |
| `commissionRate` | `Orders.CommissionRate` | 0.03 |
| `commission` | `Orders.CommissionAmount` | `ROUND(subtotal × 0.03)` (half away from zero); **no commission on the delivery fee** |
| `sellerProceeds` | `Orders.SellerProceeds` | subtotal − commission |
| `sellerPayout` | `Orders.SellerPayoutTotal` | sellerProceeds + shippingFee |

Example: subtotal 333 333, fee 20 000 → buyer pays 353 333; commission 10 000; proceeds 323 333; payout 343 333.

### Actions

| Call | From → to | Errors |
|---|---|---|
| `POST …/confirm` (seller) | PENDING → AWAITING_PAYMENT; `paymentDueAt` = now + 24 h | 409 `ORDER_DEADLINE_PASSED` (after `confirmBy`), 409 `ORDER_STATE_CONFLICT` |
| `POST …/cancel` (buyer or seller), body `{ "reason": "…" }` optional | PENDING / AWAITING_PAYMENT → CANCELLED; all listings released | 409 `ORDER_STATE_CONFLICT` (paid → use a dispute), 409 `PAYMENT_IN_PROGRESS` |
| `POST …/ship` (seller), body `{ "carrier": "GrabExpress", "trackingNumber": "…" }` optional | PAID → DELIVERING | 409 `ORDER_STATE_CONFLICT` |
| `POST …/confirm-receipt` (buyer) | DELIVERING → COMPLETED; listings Sold; one seller settlement (Pending) | 409 `ORDER_STATE_CONFLICT`, 409 `ORDER_DISPUTED` |
| `POST …/disputes` (buyer or seller), body `{ "reason": "…" }` | no status change; payout on hold | 409 `DISPUTE_NOT_ALLOWED` (unpaid, or seller already paid out), 409 `ORDER_DISPUTED` (one already open) |

The seller can never confirm receipt and the buyer can never ship (403). An open dispute blocks
`confirm-receipt` (the order row is locked, then the dispute is checked, then `usp_CompleteOrder` runs, in one
transaction). Refunds and payouts are never automatic: an admin decides and records them (Admin stage, D3/D6).

---

## Payments (simulated in the MVP)

No real payment provider is integrated. **Every payment is a sandbox simulation** (`sandbox: true`,
`Payments.IsSandbox = 1`, provider reference `SIM-…`). No money is charged, held or transferred.

1. Buyer: `POST /api/orders/{id}/payments` `{ "provider": "MOMO" }` (provider optional if chosen at checkout).

   ```json
   201 { "paymentId": 31, "orderId": 15, "provider": "MOMO", "amount": 120000, "status": "PENDING", "sandbox": true,
         "resumed": false, "createdAt": "…", "paymentDueAt": "…",
         "simulatorUrl": "/api/dev/payment-simulator/payments/31/complete" }
   ```
   The amount is the order total from the database. One attempt at a time: calling again returns the same attempt
   (200, `resumed: true`). Only for AWAITING_PAYMENT orders before `paymentDueAt` (409 `ORDER_DEADLINE_PASSED`).
   **This does not mark the order paid.**
2. Sandbox: the buyer finishes it on the simulator: `POST /api/dev/payment-simulator/payments/31/complete`
   `{ "outcome": "SUCCESS" | "FAILURE" }` → 200 with the order. The simulator behaves like a provider: it builds a
   notification (request key and amount from the database, a new `SIM-` reference), signs it with HMAC-SHA256
   and passes it through signature verification and `usp_RecordPaymentResult`. A failure leaves the order
   AWAITING_PAYMENT; the buyer can start a new attempt.
3. The order becomes PAID only when `usp_RecordPaymentResult` accepts a verified result.

### Security model

- There is **no** "mark paid" endpoint. The buyer can start a payment and, in the sandbox, choose the simulated
  outcome; the payment is recorded only through the verified-notification path.
- `POST /api/dev/payment-simulator/callback` (provider → server) has no user token, like a real provider, but needs
  `X-Simulator-Signature: <hex HMAC-SHA256>` of
  `requestKey \n providerReference \n amount \n 1|0 \n provider` with `PAYMENT_SIMULATOR_SECRET`. Missing or wrong
  signature → 401 `PAYMENT_SIGNATURE_INVALID`. The request key is never sent to browsers.
- The database then checks the attempt (request key), provider, amount = order total, duplicates (identical → 200
  `DUPLICATE_IGNORED`, conflicting → 409 `PAYMENT_CONFLICT`), and the deadline: a success after `paymentDueAt` is
  accepted only if the attempt started before it **and** arrives within the 30-minute grace window
  (409 `PAYMENT_TOO_LATE` otherwise; the server logs `PAYMENT ALERT` because a real charge would need a manual refund).
- The simulator only touches sandbox attempts. It exists only when `unimarket.payment.simulator.enabled=true`
  (default **false**; `true` in the `dev` profile). In production the `/api/dev/payment-simulator/**` endpoints do
  not exist (404).
- The simulator refuses to start in a `prod` / `production` profile even if enabled (the application fails to start).
- The simulator never touches a non-sandbox attempt (404 on complete, `PAYMENT_MISMATCH` on a signed callback).
- The signing key comes from `PAYMENT_SIMULATOR_SECRET` (`.env`, git-ignored) or a random key per run in `dev`;
  it is never logged. Request keys and provider references are never returned to browsers or logged.
- A real provider (MoMo / ZaloPay) later needs its own signature verification calling the same
  `PaymentResultService`, and `IsSandbox = 0`.

### Simulated vs real payments (frontend)

| Signal | Simulated (MVP) | Real provider (future) |
|---|---|---|
| `payments[].sandbox`, attempt `sandbox`, `settlement.sandbox` | `true` | `false` |
| attempt `simulatorUrl` | present (only while the simulator is enabled) | absent |
| How the buyer pays | page/dialog that calls `simulatorUrl` | redirect to the provider |

Rules for the UI: show "Simulated payment – no money is charged" whenever `sandbox` is `true` (keep the existing
"Demo payment: simulated" notice), never describe a sandbox payment or settlement as real money received, held or
paid out, and show the simulator choice only when `simulatorUrl` is present. If `simulatorUrl` is absent and no real
provider exists, the attempt cannot be completed: show that online payment is unavailable.

---

## Expiry (D2)

A scheduler runs `usp_ExpirePendingOrders` every minute (`ORDER_EXPIRY_INTERVAL`, default `PT1M`). All times are SQL
`SYSUTCDATETIME()`; Java passes no time. The startup log states whether it is ON or OFF.

| Environment | Default | Enable / disable |
|---|---|---|
| Local development (`dev` profile, the default profile) | **OFF** — starting the backend against the shared demo database does not expire demo orders | `ORDER_EXPIRY_ENABLED=true` |
| Other profiles (e.g. `prod`) | **ON** | `ORDER_EXPIRY_ENABLED=false` |
| Automated tests | OFF; tests call the expiry service themselves on an isolated database | — |

- PENDING past `confirmBy` (24 h after the order) → CANCELLED "Confirmation deadline exceeded".
- AWAITING_PAYMENT past `paymentDueAt` (24 h after confirmation) → CANCELLED "Payment deadline exceeded", except
  while an attempt is still pending within 30 minutes after the deadline; after that the attempt becomes EXPIRED.
- All listings of an expired order become Available again. Paid / Delivering / Completed orders are never touched.
- Safe to repeat and safe with several instances. After a restart (or while disabled) nothing is lost: the first run
  expires everything overdue. While it is off, late confirmations and late payment starts are still refused by the
  procedures, but listings stay reserved until a run.
- **Demo database:** if the job is enabled against `UniMarketJava` after 2026-11-03 03:06 UTC, it cancels demo orders
  9, 10 (AwaitingPayment) and 11 (Pending) and releases their listings, exactly as V002 documents. That is why it is
  off by default in `dev`.

## Delivery fee

`Orders.ShippingFee` is applied to **each** order of a checkout by `usp_Checkout`. **The final shipping fee
calculation method is pending team approval** (V002 open points: seller-set, configured, or otherwise). For MVP
development it is a server setting, `CHECKOUT_SHIPPING_FEE` (whole VND per order, default `0`):

- never taken from the request (a client-sent shipping amount is ignored; the request has no such field);
- shown before the buyer confirms: per seller group and in total in `GET /api/cart` and `POST /api/cart/validate`
  (the checkout preview), and in the checkout response and every order (`amounts.shippingFee`, `amounts.total`);
- every response that shows it carries
  `"shippingFeePolicy": { "method": "CONFIGURED_FLAT_PER_ORDER", "feePerOrder": 0, "approved": false, "note": "…" }`.

**A fee of 0 is a development placeholder, not an approved free-shipping policy.** The UI should label the fee as
provisional while `approved` is `false` and must not advertise "free shipping".

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CHECKOUT_SHIPPING_FEE` | `0` | Delivery fee per order (VND); provisional |
| `ORDER_EXPIRY_ENABLED` / `ORDER_EXPIRY_INTERVAL` | `false` in `dev`, `true` otherwise / `PT1M` | Expiry job |
| `PAYMENT_SIMULATOR_ENABLED` | `false` (`true` in `dev`; refused in `prod`/`production`) | Sandbox simulator |
| `PAYMENT_SIMULATOR_SECRET` | random per run in `dev` | Base64, ≥ 32 bytes; signing key of simulated notifications |

## Open points

1. **Delivery fee source** – pending decision (default 0).
2. **Checkout idempotency** – deferred (see *Retry after a lost response*); needs an approved V003.
3. **Late-payment alerts** – a rejected late success is only logged (`PAYMENT ALERT`); V002 has no table for it.
4. **Delivery note and campus** from the frontend form have no column in `Orders` (not stored).
5. **Tracking updates** after shipping: no procedure; `Deliveries` is written once by `usp_ShipOrder`.
6. Admin endpoints (cancel, resolve disputes, confirm refunds, release payouts) are the Admin stage.
