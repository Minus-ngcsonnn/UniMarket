# Stage 6.3 manual test — cart, simulated shipping, checkout, simulated payments, orders

> **Status: PENDING VERIFICATION.** This browser walkthrough has **not** been performed yet; it is deliberately deferred
> to Stage 7. Stage 6.3 was verified only by automated tests (backend suite and API checks through the Vite proxy).

Written for: the team member who will click through the whole buying flow in a browser in Stage 7. No Postman and
no SQL updates are needed for the user journey; the only admin step (approving listings) uses the Stage 5 Admin API
through `docs/scripts/approve-listing.ps1` until the admin UI is connected (Stage 6.4).

Everything here is **simulated**: "Thanh toán mô phỏng" (no money is charged or transferred, no real MoMo / ZaloPay /
bank is contacted, the bank QR text is not a payable QR) and "Vận chuyển mô phỏng" (fees come from approximate area
centres; no carrier is contacted or booked; carrier names are labels only, no partnership is implied).

## 0. Environment (isolated database only)

| Part | Setting |
|---|---|
| Backend | port **8081**, `DB_URL=jdbc:sqlserver://localhost:1433;databaseName=UniMarketJava_V003Test;…`, `ORDER_EXPIRY_ENABLED=false`, dev profile (payment simulator on), `MAIL_MODE=log` or `smtp` |
| Frontend | `UniMarket-Frontend/.env.local`: `VITE_BACKEND_URL=http://localhost:8081`, `VITE_AUTH_MODE=backend` (products and orders then use the real API), `npm run dev` → <http://localhost:5173> |
| Never | a backend on 8080 connected to the real `UniMarketJava` database |

## 1. Accounts
1. Register a **seller** with an official campus and a second **seller** with a self-declared university (choose a
   pickup area for their listings), and a **buyer** (any university). Verify each email with its code (inbox, or the
   backend log line `DEV E-MAIL` with `MAIL_MODE=log`).
2. Use different browsers / private windows for the buyer and the sellers.

## 2. Listings
1. Each seller: **Sell an item** → publish 1–2 listings with photos. They show "Pending review" in My listings.
2. Approve them: `powershell -ExecutionPolicy Bypass -File UniMarket-Backend\docs\scripts\approve-listing.ps1 -ProductId <id>`
   (admin of the test copy). They appear in the marketplace.

## 3. Cart (buyer)
1. Open a listing → **Add to cart** (twice: the second time says "Already in your cart"). Add a listing of the other
   seller. The header shows the count; reload: the cart is still there (saved with the account).
2. As a seller, open your own listing: no buy buttons; adding it from another way is refused ("your own listing").
3. Cart page: two seller groups; "Simulated delivery, quoted at checkout". Untick one item, remove another.

## 4. Shipping quote and checkout (buyer)
1. **Proceed to Checkout** (or **Buy now** on one listing: only that listing, the cart is not used).
2. Enter name, Vietnamese mobile number, address; choose the **delivery area**. Each seller group shows the pickup area,
   about-distance and the simulated carriers with fees; a group within 3 km shows **Free**. Pick a carrier per seller.
3. Check the summary: per-seller subtotal + delivery fee, and the total. The countdown shows the 15-minute validity;
   after it expires, **Get new estimates**. Changing the area re-quotes.
4. **Place order request** → confirmation page with one order per seller (status "Waiting for seller").

## 5. Seller confirmation
Seller: **My orders → Sales** → the order → **Confirm order** (or **Decline**). The buyer's delivery details are
**not** visible yet ("appear after they have paid"). The payment deadline (24 h) is shown.

## 6. Payment (buyer, simulated)
1. **Pay now** → choose MoMo / ZaloPay / Bank QR (simulated) → **Continue to simulated payment**: amount = order total
   from the server. Bank QR shows a text payload marked "SIMULATED … not a real bank transfer".
2. Try **Simulate failed payment** once (order stays "Awaiting payment"), then pay again and **Simulate successful
   payment** → "Paid". The order lists the payment attempts (simulated).

## 7. Delivery and completion
1. Seller: the delivery details are now visible → **Mark as delivering** (records the chosen simulated carrier).
2. Buyer: **I've received it** → "Completed". The listing is shown as sold.

## 8. Money check (seller view of the completed order)
Items subtotal, delivery fee (all passed to the seller), UniMarket fee = 3 % of items only (never of the delivery fee),
payout = items − fee + delivery fee, settlement "pending" (simulated, recorded by an admin later).
Example: items 200 000, delivery 26 000 → buyer pays 226 000; fee 6 000; payout 220 000.

## 9. Cancellation
Place another order: the buyer can **Cancel order** while it is waiting for the seller or for payment; the seller can
**Decline**. After payment, cancel is no longer offered (disputes are a later stage).

## Known limits
- No true checkout idempotency key (deferred, needs an approved migration). After a network failure the page says the
  order may or may not exist and links to My orders; a retry of the same items is refused with links to the existing
  orders.
- Reviews, reports, disputes, promotions and the admin UI are not connected yet (later stages).
- Tracking numbers are optional; there is no tracking update after shipping.
