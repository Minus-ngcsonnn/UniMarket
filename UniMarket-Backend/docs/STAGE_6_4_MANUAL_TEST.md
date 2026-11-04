# Stage 6.4 / Stage 7 manual test — the complete website in a browser

> **Status: PENDING.** Nothing in this guide has been clicked through in a browser yet. Stage 6 was verified by
> automated tests only (backend suite and API checks through the Vite proxy). The full walkthrough is planned for Stage 7.

Written for: the team member who tests the finished website end to end in Stage 7. No Postman and no SQL are needed.
Everything about money and delivery is **simulated** ("Thanh toán mô phỏng", "Vận chuyển mô phỏng"): no money is
charged, refunded or paid out, no carrier is booked, the bank QR text is not payable.

## 0. Environment (isolated database only)

| Part | Setting |
|---|---|
| Backend | port **8081**, `DB_URL=jdbc:sqlserver://localhost:1433;databaseName=UniMarketJava_V003Test;…` (always set it: the default points to the real database), `ORDER_EXPIRY_ENABLED=false`, dev profile (payment simulator on), `MAIL_MODE=log` (codes in the backend log) or `smtp` |
| Frontend | `.env.local`: `VITE_BACKEND_URL=http://localhost:8081`, `VITE_AUTH_MODE=backend` → products, orders, admin and community all use the real API. `npm run dev` → <http://localhost:5173> |
| Admin account | an Admin of the test copy (e.g. the demo admin `demo.admin@fpt.edu.vn`, password from the team) |
| Never | a backend connected to the real `UniMarketJava` database |

Use separate browsers / private windows for: **seller A**, **seller B**, **buyer**, **admin**.

## 1. Registration and authentication
Register seller A (official campus), seller B (self-declared university) and the buyer; verify each email with its
code; sign in / sign out; "Forgot password" once; check that "Remember me" keeps the session after a browser restart.

## 2. Listing creation
Sellers: **Sell an item** with 1–3 photos (one phone photo with location is fine: the stored copy has no GPS data).
Seller B must pick a pickup area. The listings show "Pending review" in My listings.

## 3. Admin moderation
Admin → **Products** (tab Pending) → **Review**: check photos, description, seller → **Approve** one listing; for
another, **Reject** with a reason. Seller: My listings shows "Blocked" with the reason. Edit a listing while the admin
has its review open, then approve in the admin window: the page says it changed and loads the new version.

## 4. Discovery and favorites
Buyer: search, filters (category, price, condition, area), product page, heart a listing, reload, Saved items.

## 5. Cart and checkout
Add listings of both sellers to the cart → Checkout → delivery area → per-seller simulated carrier (free ≤ 3 km) → total
→ Place order request (one order per seller). Also try **Buy now** on a single listing.

## 6. Seller confirmation
Each seller: My orders → Sales → **Confirm order** (or Decline). Delivery details are hidden until payment.

## 7. Simulated payment
Buyer: **Pay now** → MoMo / ZaloPay / Bank QR (simulated) → one failed attempt, then a successful one → "Paid".

## 8. Shipping and receipt
Seller: **Mark as delivering**. Buyer: **I've received it** → Completed.

## 9. Reviews
On the completed order: buyer **Review seller**, seller **Review buyer** (once each). The seller's public profile shows
the rating; a second review is refused.

## 10. Reports
Buyer: report a listing ("Report this listing") and a student ("Report this student"); a second report of the same
target is refused while open. Admin → **Violation reports**: Start review → Resolve (or Dismiss) with a note.

## 11. Disputes
On a paid order (before receipt), buyer → **Report a problem** with a reason. "I've received it" is now blocked.
Admin → **Disputes** → Review → **Approve refund** (decision only) or **No refund**; after a refund decision,
**Record refund reference** (simulated for sandbox orders). Both sides see the result on the order page.

## 12. Promotions
Seller A: My listings → an approved, available listing → **Feature this listing** → package → simulated payment
(success) → "Featured" until the end time; the listing appears with `featured` in the catalog. A second promotion while
active is refused.

## 13. Admin dashboard
Admin → **Overview**: change the period; check users, listings, orders by status, money (GMV, delivery fees, buyer
total, 3 % commission, payouts, sandbox counts), payouts, reports, disputes, promotions. No trend lines are shown (no
history series exists).

## 14. User management
Admin → **Users**: search by email, open the buyer, **Suspend account** with a reason → the buyer's next action signs them
out; **Reactivate account**. Admin accounts and your own account cannot be suspended; no role can be changed.

## 15. Settlement administration
Admin → **Settlements**: the completed order's payout = items − 3 % + delivery fee, marked Simulated →
**Record simulated payout** with a reference → Released (a second time is refused). A disputed order's payout is on hold.

## 16. Logout and authorization
Sign out everywhere. As the buyer, open `/admin` directly → no access. As a student, admin pages and admin buttons are
never shown; an expired session asks to sign in again.

## Known limits (Stage 6)
- Checkout idempotency key not implemented (retry after a lost response gets links to the existing orders).
- No admin bulk moderation, no category management, no review hiding, no evidence uploads for disputes, no admin
  promotion list, no admin order search, no private-contact view in the UI.
- Photos uploaded before Stage 6.4 still contain their original metadata (not rewritten).
- Payments, refunds, payouts and delivery are simulated.
