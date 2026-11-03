# Business Plan change proposal – November 2026 team decisions

Written for: the team members who maintain the UniMarket Business Plan (version of 31 October 2026).

The Business Plan document itself was **not edited**. This list identifies the passages that the team's new decisions
make outdated, so the authors can update them while keeping the document's structure. Financial projections, market
sizes, KPIs and operational assumptions are **not** changed here; any change to them needs a separate approval.

## 1. Categories used below

- **BP** – existing approved Business Plan requirement (still valid).
- **DECISION** – new official team decision overriding outdated BP text.
- **ENGINEERING** – engineering recommendation (not a business requirement).
- **PENDING** – not decided yet.

## 2. Passages to update

| BP section | Current wording (summary) | Category | Proposed direction |
|---|---|---|---|
| 1 / 2.3 Target customers | Students, initially piloted at FPT University Hoa Lac | DECISION | University and college students across Vietnam; FPT Hoa Lac remains the first demonstration community and dataset |
| 3.2 How the business works – Sellers | "Register and verify their account using their institutional .edu.vn student email" | DECISION | Register with any valid email address; the account is activated after an email one-time code (OTP) |
| 3.2 Platform – Trust & Security | "Verifies student credentials" | DECISION | Verifies ownership of the email address; UniMarket does not verify enrolment (no student ID, FAP, SSO or manual approval) |
| 3.3 Stakeholders – University administrations | "campus-level verification" partners | PENDING | Keep as a possible future partnership; no verification integration is planned |
| 6.3 Core functions – Registration | "Student accounts can be verified through institutional email" | DECISION | "Accounts verify their email address with a one-time code" |
| 6.4 Front-end pages – Register / Login | "account registration, login, and student verification" | DECISION | "account registration, login and email verification" |
| 6.7 Security – Student verification | "verify their accounts through institutional student email … reduce fake accounts" | DECISION | Email ownership verification; fake-account risk is handled by reports, moderation and suspension (BP 6.7 reports) |
| Conclusion / differentiation | "student account verification" as a key feature | DECISION | "student-focused marketplace with email-verified accounts, campus-based browsing and protected online payments" |
| 5 Marketing – pilot geography | FPT Hoa Lac campaigns, "First 100 UniMarket Users" | PENDING | Campaign geography is a marketing decision; not changed here |
| 3.2 / 6.3 Registration – affiliation | University taken from the institutional email | DECISION | Students choose their university / campus from the list or **type the name of their university or college**; the name is self-declared and not verified; campus is optional |
| 4.1.4 / 6.4 Delivery costs (academic MVP) | Delivery arranged by users; costs disclosed before payment | DECISION | **Simulated** shipping estimates for the academic demo: delivery **free within 3 km**; above 3 km the estimate depends on the distance between demo areas and the chosen simulated option (GrabExpress / Ahamove / Standard, labelled simulated, no partnership, no logos); shown with the total before checkout; paid online with the order; excluded from the 3 % commission; passed to the seller |
| 3.4 / 6.5 Delivery process | Seller arranges delivery after payment | BP (unchanged) + DECISION | Seller arranges delivery after the successful (simulated) online payment; within 3 km the buyer pays no delivery fee and the seller delivers at their own cost |
| 6.6 Payment | Online payment through a provider | BP (unchanged) | Online payment only; in the academic MVP all payments are simulated (no real money) |
| 6.6 Payment methods | MoMo, ZaloPay | DECISION | MoMo, ZaloPay and **bank transfer by QR**, all **simulated** in the academic MVP: the bank QR screen shows a demo code clearly labelled "simulated – do not transfer money" (not a real VietQR / bank account); an order is marked paid only after the server verifies the (simulated) provider result; no claim of confirmation by a real bank |
| 6.3 / 6.7 Location data | – | DECISION | Listings and deliveries use approximate demo areas (zone centres), not precise addresses or real road distances |
| Future (not MVP) | – | PENDING | Real carrier integration, contracts, actual prices, quote validity and booking responsibility |

## 3. Unchanged (still valid BP requirements)

Online payment only (no COD, direct transfer or in-person payment); free standard listings; 3 % commission on the
merchandise subtotal (D4); shipping excluded from commission and passed to the seller (D1); one order per seller with
several items; seller confirmation within 24 h; buyer payment within 24 h of confirmation with the V002 grace window;
admin-managed disputes with manual refund confirmation (D3); manual settlement release (D6); reviews after completion,
one per direction (D5); promotion packages 5 000 / 15 000 / 30 000 VND.

## 4. Engineering notes (not BP requirements)

- Nationwide registration, simulated shipping and the simulated Bank QR provider need V003:
  `V003_DESIGN_nationwide_and_simulated_shipping.md`. Tested on isolated copies on 2026-11-03 (section 11 there);
  **not applied to `UniMarketJava`** — that needs a separate approval.
- A real bank / VietQR integration would need a provider contract, real account data and webhook verification; it is
  not part of the MVP.
- Wording in the product must not claim "verified students"; the frontend now shows "Email verified" only.
