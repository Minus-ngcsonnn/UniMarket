# UniMarket — Stage 7 final demo walkthrough

Environment: see `STAGE_7_LOCAL_STARTUP.md`. Rehearse on the clone `UniMarketJava_Stage7ReadyTest`
(backend 8083, frontend http://localhost:5175); the official demo uses `UniMarketJava` only after explicit approval.

## Demo accounts

| Role | Account | Why |
|---|---|---|
| Admin | `demo.admin@fpt.edu.vn` | the only admin |
| Buyer | `demo.student10@fpt.edu.vn` | empty cart, no open orders |
| Seller 1 | `demo.student02@fpt.edu.vn` | 4 public listings (FPT Hoa Lac) |
| Seller 2 | `demo.student09@fpt.edu.vn` | 4 public listings (FPT Hoa Lac) |
| Self-declared university | register live during the demo (any e-mail) | shows the nationwide registration path |
| Refused on sign-in | `demo.student15` (e-mail not verified), `demo.student16` (suspended) | security checks |

Passwords are **not** stored in this repository's documentation. The seeded demo accounts share the fictional password
written in the V001 baseline comment; before a public demo, set your own password per account with
**Forgot password** (with `MAIL_MODE=log` the 6-digit code appears in the backend console as `DEV E-MAIL`). Never
reuse a real personal password.

## Walkthrough (≈ 15 minutes)

| # | Step | Who | Verification status |
|---|---|---|---|
| 1 | Register (official campus *FPT Hoa Lac* or "My university is not listed"), enter the 6-digit code, signed in automatically | new user | VERIFIED IN BROWSER |
| 2 | Sign out / sign in, wrong password refused, Forgot password → reset → sign in | new user | VERIFIED IN BROWSER |
| 3 | Marketplace: search (Vietnamese with accents), category / price / condition / campus / area filters, sorting, pagination | guest | VERIFIED IN BROWSER |
| 4 | Product page: reference photo + attribution line; placeholder on listings without a photo | guest | VERIFIED IN BROWSER |
| 5 | Favorite a listing, reload, see it in Saved items, remove it | buyer | VERIFIED IN BROWSER |
| 6 | Sell an item: JPG/PNG/WebP photos (5 MB and 8-photo limits), publish → "Hidden until an admin approves it" | seller | VERIFIED IN BROWSER |
| 7 | Admin › Products: review → Approve (listing goes public); Reject with a reason (≥ 10 chars; seller sees it in My listings) | admin | VERIFIED IN BROWSER |
| 8 | Cart with listings from two sellers → one group per seller → Checkout | buyer | VERIFIED IN BROWSER |
| 9 | Delivery area: *Hòa Lạc* → free (≤ 3 km); *Cầu Giấy* → simulated fee; carrier per seller; totals | buyer | VERIFIED IN BROWSER |
| 10 | Place order → one order per seller; listings become Reserved | buyer | VERIFIED IN BROWSER |
| 11 | Each seller confirms (My sales) | sellers | VERIFIED IN BROWSER |
| 12 | Pay: MoMo success; ZaloPay failure (order stays unpaid) then Bank QR success — all labelled *simulated* | buyer | VERIFIED IN BROWSER |
| 13 | Seller: Mark as delivering → buyer: I've received it → Completed; seller sees "Your payout" | both | VERIFIED IN BROWSER |
| 14 | Reviews both ways; second review not offered; rating on the seller profile | both | VERIFIED IN BROWSER |
| 15 | Report a listing (duplicate report refused) → Admin › Violation reports: Details → Resolve | buyer, admin | VERIFIED IN BROWSER |
| 16 | Paid order → Report a problem → Admin › Disputes: Approve refund → Record refund reference (no money moves) | buyer, admin | VERIFIED IN BROWSER |
| 17 | My listings › Feature this listing → simulated payment (failure: not featured; success: featured) | seller | VERIFIED IN BROWSER |
| 18 | Admin › Overview figures, Users (search, suspend with reason → sign-in refused, reactivate), Orders (payment attempts), Settlements (current-rule vs **Legacy V001** records, record a simulated payout) | admin | VERIFIED IN BROWSER |
| 19 | Sign out; admin pages need sign-in; an invalid session token signs the user out | any | VERIFIED IN BROWSER |
| 20 | Messages / chat between students | — | NOT IMPLEMENTED (page is a placeholder) |
| 21 | Editing the profile / contact details from the profile page | — | NOT IMPLEMENTED (notice shown) |

## Known limitations (Stage 7)

* **Profile editing is not implemented**: the profile page shows a notice; contact settings exist only in the API
  (`GET/PUT /api/me/contact`). The "Sales" / "Purchases" counters on the profile show "–".
* **Messages / chat is a placeholder** ("Messages are coming soon"); order updates appear in My orders.
* **Accent-insensitive search is incomplete**: the database collation is accent-sensitive (`CI_AS`), so `sach` does
  not find `sách`. Search with Vietnamese accents.
* **Mobile order progress labels may truncate** (e.g. "Confir…") on narrow screens; the status badge stays complete.
* **Not browser-tested**: real SMTP delivery (all tests used `MAIL_MODE=log`) and real-time JWT expiry (only an invalid
  token was tested; expiry itself is covered by backend tests).
* A rejected listing is shown to the seller as "Blocked by an admin": the database has one status for both a
  rejection and a block. The seller still sees the admin's reason and can edit and resend the listing.
* 12 seeded listings have no reference photo yet and show a neutral placeholder (see `photos/CREDITS.md`).

Tips for the live demo
* Use a delivery area far from Hòa Lạc (e.g. *Cầu Giấy*) to show a non-zero simulated delivery fee; all seeded
  listings are at FPT Hoa Lac, so *Hòa Lạc* shows free delivery.
* Paid orders #7 and #8 of the seed data can be used for a dispute without placing a new order.
* Order expiry is OFF in demo mode: overdue orders stay as they are until a participant cancels them.
