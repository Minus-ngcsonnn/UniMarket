# UniMarket

UniMarket is a C2C second-hand marketplace for university and college students in Vietnam. Students list items,
buy from several sellers in one checkout, pay online (simulated in this academic MVP) and rate each other after
delivery. Administrators moderate listings, handle reports and disputes, and confirm seller payouts.

It is a full-stack web application: a **Spring Boot** REST API, a **React (Vite)** single-page frontend and a
**Microsoft SQL Server** database.

> **Status (November 2026): academic MVP, feature-complete for the demo.** All Business Plan flows below run end to end
> against the real database (`UniMarketJava`, migrations V001–V003). Payments and delivery fees are **simulated**: no
> real money moves and no carrier is contacted. FPT University Hoa Lac is the first demo community; registration is
> open to students of any Vietnamese university or college. See [Known limitations](#9-known-limitations).

---

## 1. Features

| Area | What works |
|---|---|
| Accounts | Register with any valid email + 6-digit OTP (10 min, 5 tries), choose an official campus **or** type your own university (self-declared, not verified); login with JWT; forgot / reset password by email; roles Student and Admin; suspended accounts cannot sign in |
| Listings | Create / edit / delete with photos (stored on disk, metadata stripped), condition New / Like New / Used, category, price, pickup area; **pre-moderation**: a new or edited listing is hidden until an admin approves it |
| Browsing | Catalog with keyword, category, price, condition, university / campus filters; product page; seller profile with ratings; saved items (favorites); featured (promoted) listings |
| Cart & checkout | Cart grouped by seller; checkout creates **one order per seller** (several items each, quantity 1); delivery address and area; **simulated shipping quote per seller** (free ≤ 3 km), total shown before placing the order |
| Orders | `PENDING` → seller confirms within 24 h → `AWAITING_PAYMENT` → buyer pays within 24 h → `PAID` → seller ships → `DELIVERING` → buyer confirms receipt → `COMPLETED`; or `CANCELLED`. Buyer and seller views, action badges refreshed every 30 s |
| Payments | Online only (no COD, no direct transfer to sellers): **MoMo, ZaloPay, Bank QR — all simulated**, server-verified signed results |
| Money | 3 % commission on the items subtotal (not on delivery); seller payout = subtotal − commission + delivery fee; settlement created at completion, released manually by an admin |
| Trust | Reviews in both directions after completion (1–5 stars, one per side); reports on listings / users; disputes on paid orders (admin decides `NO_REFUND` / `REFUND_APPROVED`, refund confirmed by reference); contact (phone / Zalo) shown only if the user chooses |
| Promotions | 24-hour boost 5 000 ₫, featured 3 days 15 000 ₫, featured 7 days 30 000 ₫, paid with a simulated payment |
| Admin | Dashboard, listing moderation queue (approve / reject / block / remove), users (suspend / reactivate), orders (read only), categories (read only), reports, disputes, settlements |
| UI | Vietnamese / English, responsive, Figma-based design tokens |

The full mapping of Business Plan requirements to code, database and tests is in
[`database/docs/BUSINESS_PLAN_TRACEABILITY.md`](database/docs/BUSINESS_PLAN_TRACEABILITY.md).

---

## 2. Technology Stack

| Layer      | Technology |
|------------|------------|
| Backend    | Java 21, Spring Boot 3.5 (Web, Security / OAuth2 resource server with JWT, Data JPA, Validation, Mail, Actuator), Maven wrapper |
| Database   | Microsoft SQL Server 2019+ (developed on 2022), `mssql-jdbc`; business rules in constraints, triggers and stored procedures (`usp_*`) |
| Frontend   | React 19, Vite 8, Tailwind CSS 4, React Router, Axios, ESLint |
| UI         | Inter font (self-hosted), design tokens in `src/index.css` |
| API style  | RESTful JSON, all endpoints under `/api`, one error format |
| Tooling    | Git & GitHub, Visual Studio Code, Windows PowerShell |

Backend architecture is **layered**: `controller → service → repository / stored procedures → entity`, with `dto`
objects for API input and output.

---

## 3. Project Structure

```text
UniMarket/
├── start-unimarket-demo.ps1         One-command official demo start (checks, backup, backend 8080, frontend 5173)
├── stop-unimarket-demo.ps1          Stops only UniMarket backend / Vite processes (-ListOnly to show them)
├── UniMarket-Backend/               Spring Boot REST API
│   ├── src/main/java/com/unimarket/
│   │   ├── controller/              Auth, Catalog, Listing, Favorite, Cart, Order, Community, Admin, PaymentSimulator, Health
│   │   ├── service/                 auth, product, order, shipping, promotion, review, admin, mail, storage, account
│   │   ├── repository/  entity/  dto/
│   │   ├── security/                JWT, password stamps, attempt limiter, verification-code hashing
│   │   ├── config/                  Security, CORS, order-expiry scheduler
│   │   └── common/  exception/      Error codes and the JSON error handler
│   ├── src/main/resources/          application.properties (reads env variables), application-nodb.properties
│   ├── src/test/java/               Unit and integration tests
│   ├── docs/                        API references, Stage 7 startup guide and demo walkthrough
│   ├── docs/scripts/                start-backend.ps1, check-active-db.ps1, smoke-login.ps1
│   └── .env.example                 Configuration template (copy to .env, git-ignored)
├── UniMarket-Frontend/              React + Vite SPA
│   ├── public/images/demo/          Demo product photos (licensed, see photos/CREDITS.md)
│   ├── src/
│   │   ├── pages/                   auth, products, checkout, orders, profile, admin (+ admin/live), info
│   │   ├── components/  hooks/  services/  constants/  i18n/  utils/
│   │   ├── mocks/                   Sample data for the offline UI mode
│   │   └── App.jsx                  Routes
│   ├── .env.example
│   └── vite.config.js               Dev server, /api proxy, data-mode switches
└── database/
    ├── baseline/                    V001 installer (creates UniMarketJava with demo data)
    ├── migrations/                  V002 multi-item orders, V003 nationwide registration + simulated shipping (+ rollback)
    ├── validation/  tests/          Read-only checks; test scripts that run only on *Test copies
    ├── schema/                      Generated schema reference
    ├── docs/                        Business Plan traceability, change proposal, V002 / V003 designs and runbook
    └── README.md                    How to run and test database scripts
```

---

## 4. Required Software

| Software                      | Version         | Check with          |
|-------------------------------|-----------------|---------------------|
| JDK                           | **21** (LTS)    | `java -version`     |
| Node.js                       | **22.22+** (LTS)| `node -v`           |
| npm                           | 10+             | `npm -v`            |
| Microsoft SQL Server          | 2019 or 2022    | SSMS / `sqlcmd`     |
| Git                           | any recent      | `git --version`     |
| Visual Studio Code (suggested)| latest          |                     |

Maven does **not** need to be installed: use the wrapper (`mvnw.cmd`). Recommended VS Code extensions are listed in
`.vscode/extensions.json`.

If you have several JDKs, point one PowerShell session at JDK 21:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.x-hotspot"   # adjust to your install path
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

---

## 5. Quick Start: Official Demo (one command)

Prerequisites: SQL Server running with the `UniMarketJava` database (section 6), `npm install` done once in
`UniMarket-Frontend`, and `UniMarket-Backend\.env` filled in (section 6.3).

```powershell
cd D:\Minus\UniMarket
powershell -ExecutionPolicy Bypass -File .\start-unimarket-demo.ps1   # start (about 1–2 minutes)
powershell -ExecutionPolicy Bypass -File .\stop-unimarket-demo.ps1    # stop all UniMarket processes
```

The start script:

1. checks SQL Server, that `UniMarketJava` is ONLINE with migrations V001, V002, V003;
2. makes a `COPY_ONLY` verified backup if the latest one is older than 24 hours;
3. checks that the required `.env` values exist (it never prints them);
4. stops any other UniMarket backend / Vite process and checks that ports 8080 and 5173 are free;
5. builds the backend and runs it from an **immutable JAR copy** on **8080** (real Gmail SMTP, simulated payments and
   delivery, `ddl-auto=validate`, order expiry OFF), then Vite on **5173** with the real APIs;
6. verifies which database the backend is connected to, the frontend proxy and a sign-in smoke test.

Open **http://localhost:5173**. Both servers run detached and hidden (closing the terminal does not stop them).
Logs: `%LOCALAPPDATA%\UniMarket\logs\backend-8080.log` and `frontend-5173.log`.

| Service       | URL                                  |
|---------------|--------------------------------------|
| Frontend      | http://localhost:5173                |
| Backend API   | http://localhost:8080/api            |
| Health check  | http://localhost:8080/api/health     |

**Demo accounts** (fictional, created by V001): `demo.admin@fpt.edu.vn` (Admin) and `demo.student01@fpt.edu.vn` …
`demo.student14@fpt.edu.vn` (Students). `demo.student15` is intentionally unverified and `demo.student16`
intentionally suspended. The shared demo password is documented in the V001 header comment
(`database/baseline/V001__UniMarket_BusinessAligned.sql`); you can also register your own account with a real email.
A guided 15-minute script is in
[`UniMarket-Backend/docs/STAGE_7_DEMO_WALKTHROUGH.md`](UniMarket-Backend/docs/STAGE_7_DEMO_WALKTHROUGH.md); details
and troubleshooting are in [`UniMarket-Backend/docs/STAGE_7_LOCAL_STARTUP.md`](UniMarket-Backend/docs/STAGE_7_LOCAL_STARTUP.md).

> Automated tests and rehearsals that write data must run on a **database clone** (e.g. `UniMarketJava_Stage7BrowserTest`)
> with other ports, never on `UniMarketJava`. `docs/scripts/start-backend.ps1` refuses the main database unless
> `-OfficialDemo` is given.

---

## 6. Database Setup (SQL Server)

### 6.1 Create the database

- Run **`database/baseline/V001__UniMarket_BusinessAligned.sql`** once on a fresh server (SSMS → *Query → SQLCMD
  Mode*, execute the whole file). It creates **`UniMarketJava`** with tables, views, procedures, triggers and demo
  data, and refuses to run if the database already exists.
- Then apply the migrations in order: `migrations/V002__multi_item_orders.sql`, then
  `migrations/V003__nationwide_registration_and_simulated_shipping.sql`. Each runs once and records itself in
  `dbo.SchemaMigrations`; follow `database/README.md` and `database/docs/V003_DEPLOYMENT_RUNBOOK.md`.
- The current backend **requires V003** (it does not start against a V002-only database).

### 6.2 Create a SQL login for the application

The backend connects with **SQL Server Authentication**. Use a dedicated login rather than `sa`, with your own strong
password:

```sql
CREATE LOGIN unimarket_app WITH PASSWORD = '<choose-a-strong-password>';
USE UniMarketJava;
CREATE USER unimarket_app FOR LOGIN unimarket_app;
ALTER ROLE db_datareader ADD MEMBER unimarket_app;
ALTER ROLE db_datawriter ADD MEMBER unimarket_app;
GRANT EXECUTE ON SCHEMA::dbo TO unimarket_app;   -- the order, payment and settlement procedures (usp_*)
```

On the server, enable **mixed mode authentication** and **TCP/IP** (with a fixed port for named instances).

### 6.3 Configuration (never commit it)

Copy `UniMarket-Backend/.env.example` to `UniMarket-Backend/.env` (git-ignored) and fill it in. Environment variables
of the current session take precedence over `.env`.

| Variable | Description | Default |
|---|---|---|
| `DB_URL` | JDBC URL | `…localhost:1433;databaseName=UniMarketJava;encrypt=true;trustServerCertificate=true` |
| `DB_USERNAME` / `DB_PASSWORD` | SQL login | *(required)* |
| `DB_POOL_SIZE` | Maximum connections | `10` |
| `SERVER_PORT` | API port | `8080` |
| `SPRING_PROFILES_ACTIVE` | `dev` (default) or `nodb` | `dev` |
| `JWT_SECRET` / `JWT_ACCESS_TOKEN_TTL` | Base64 key (≥ 32 bytes) signing access tokens / token lifetime | random per start in `dev` (everyone signs in again after a restart) |
| `VERIFICATION_CODE_SECRET` | Base64 key hashing email codes | random per start in `dev` |
| `MAIL_MODE` | `log` (codes printed to the backend log) or `smtp` | `log` in `dev`; the official demo uses `smtp` |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USERNAME` / `MAIL_PASSWORD` / `MAIL_FROM` / `MAIL_FROM_NAME` | SMTP (Gmail: `smtp.gmail.com`, 587, STARTTLS, a Google **App Password**) | *(none)* |
| `MAIL_VERIFY_ON_STARTUP` / `MAIL_STARTTLS_REQUIRED` / `MAIL_TIMEOUT_MS` / `MAIL_EHLO_NAME` | SMTP checks and tuning | see `.env.example` |
| `CORS_ALLOWED_ORIGINS` | Browser origins allowed to call the API | `http://localhost:5173` |
| `UPLOAD_DIR` | Folder for uploaded listing photos | `uploads` (git-ignored) |
| `SHIPPING_QUOTE_SECRET` | Base64 key signing simulated shipping quotes | random per start in `dev` |
| `ORDER_EXPIRY_ENABLED` / `ORDER_EXPIRY_INTERVAL` | 24 h deadline job | `false` in `dev` (protects demo orders), `true` otherwise / `PT1M` |
| `PAYMENT_SIMULATOR_ENABLED` / `PAYMENT_SIMULATOR_SECRET` | Sandbox payment simulator and its signing key | `true` in `dev`, refused in production / random per start |

Outside the `dev` profile the secrets are required. `trustServerCertificate=true` is for local development only.

### 6.4 Schema management policy

- `spring.jpa.hibernate.ddl-auto=validate`: Hibernate only checks entities against the existing tables. Never use
  `create`, `create-drop` or `update`.
- Schema changes are new numbered migrations in `database/migrations/`, tested on a copy first (`database/tests/`),
  applied to `UniMarketJava` only with team approval and a verified backup.
- Entities use the exact SQL names (e.g. `Users.UserId`); value mappings such as `Like New` ↔ `LIKE_NEW` and
  `Rejected` ↔ `BLOCKED` are in `UniMarket-Backend/docs/FRONTEND_INTEGRATION.md`.

---

## 7. Manual Development Setup

### 7.1 Backend

```powershell
cd UniMarket-Backend
.\mvnw.cmd clean verify                                       # compile and run the tests
.\mvnw.cmd spring-boot:run                                    # run with SQL Server (dev profile)
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=nodb"  # run without a database (health check only)
```

For anything longer than a quick check, prefer the helper, which sets `DB_URL` explicitly and runs a JAR copy (a
Maven rebuild then cannot break the running server):

```powershell
.\docs\scripts\start-backend.ps1 -Database UniMarketJava_Stage7BrowserTest -Port 8083 -FrontendPort 5175
.\docs\scripts\check-active-db.ps1      # which database each running backend really uses
.\docs\scripts\smoke-login.ps1          # sign-in smoke test (no real password needed)
```

`GET /api/health` returns `{ "status": "UP", "application": "UniMarket", "database": "UP" }` (`DISABLED` with `nodb`).
Every error uses one JSON format (`timestamp`, `status`, `error`, `code`, `message`, `path`, `fieldErrors`); stack
traces and SQL details are never returned. Read-only tests against the real database are skipped unless
`UNIMARKET_DB_IT=true`.

### 7.2 Frontend

```powershell
cd UniMarket-Frontend
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run build      # production build into dist/
```

Vite proxies `/api` to `VITE_BACKEND_URL` (default `http://localhost:8080`), so the browser sees one origin. For the
real backend create `UniMarket-Frontend/.env.local` (git-ignored):

```text
VITE_BACKEND_URL=http://localhost:8080
VITE_AUTH_MODE=backend
```

With `VITE_AUTH_MODE=backend`, sign-in, products, orders and admin all use the real API (the Vite log prints the
active modes). Without it, `npm run dev` runs an **offline UI mode** with sample data from `src/mocks/` (pages show a
*Sample data* notice and actions are previews); `VITE_USE_MOCK_DATA`, `VITE_USE_MOCK_PRODUCTS`, `VITE_USE_MOCK_ORDERS`
and `VITE_USE_MOCK_ADMIN` override each area (see `.env.example`).

### 7.3 Routes

| Area | Routes |
|---|---|
| Marketplace | `/marketplace`, `/products/:id`, `/deals`, `/saved`, `/users/:id` |
| Selling | `/sell`, `/my-listings`, `/my-listings/:id/edit`, `/shop` |
| Buying | `/cart`, `/checkout`, `/orders/confirmation`, `/orders` (`?view=sales`), `/orders/:id`, `/messages` (placeholder) |
| Account | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/profile`, `/settings` |
| Information | `/how-it-works`, `/safety`, `/help`, `/about`, `/contact`, `/ambassadors`, `/privacy`, `/terms` |
| Admin | `/admin`, `/admin/products`, `/admin/users`, `/admin/orders`, `/admin/categories`, `/admin/reports`, `/admin/disputes`, `/admin/settlements` |

The backend checks the role on every admin request; hiding pages in the frontend is not security.

### 7.4 API references

| Topic | Document |
|---|---|
| Register, OTP, login, JWT, password reset, roles | [`AUTH_API.md`](UniMarket-Backend/docs/AUTH_API.md) |
| Catalog, listings, photos, favorites, areas | [`PRODUCTS_API.md`](UniMarket-Backend/docs/PRODUCTS_API.md) |
| Cart, checkout, shipping quotes, orders, payments, expiry | [`ORDERS_API.md`](UniMarket-Backend/docs/ORDERS_API.md) |
| Moderation, users, reviews, reports, disputes, settlements, promotions, dashboard | [`ADMIN_API.md`](UniMarket-Backend/docs/ADMIN_API.md) |
| Value mappings between SQL, API and UI | [`FRONTEND_INTEGRATION.md`](UniMarket-Backend/docs/FRONTEND_INTEGRATION.md) |

---

## 8. Styling: Tailwind CSS and design tokens

Tailwind CSS v4 runs through `@tailwindcss/vite`; there is no `tailwind.config.js`. All design tokens live in the
`@theme` block of `UniMarket-Frontend/src/index.css` and become Tailwind classes (`bg-primary`, `text-ink`,
`text-ink-muted`, `border-line`, `bg-canvas`, `bg-surface`, `text-success` / `-warning` / `-danger`,
`rounded-control`, `rounded-card`). The primary color `#2459E0` and the Inter font come from Figma.

- Style components with Tailwind classes; add plain CSS to `index.css` only when Tailwind cannot express it.
- Use the token classes, never raw hex values or Tailwind's default palette.
- Use the default spacing scale and mobile-first breakpoints (`sm:`, `md:`, `lg:`).

---

## 9. Known limitations

- **Simulated money and delivery:** MoMo, ZaloPay and Bank QR are sandbox simulations; shipping fees come from a
  simulated distance formula between demo areas (zone centres), not from a carrier. Refunds and seller payouts are
  records of transfers made outside UniMarket.
- **Profile editing** is not implemented (contact settings exist only in the API); **Messages / chat** is a placeholder.
- **Search is accent-sensitive** (`CI_AS` collation): search with Vietnamese accents.
- A rejected listing is shown as "Blocked" (one database status for both); the seller still sees the reason.
- Order expiry is OFF in the demo, so overdue demo orders stay until someone cancels them.
- `JWT_SECRET` is random per start in `dev`: users sign in again after a backend restart.
- 12 seeded listings have no reference photo yet and show a placeholder.
- Not in the MVP: real payment gateways, real carriers, advertising, notifications, student-ID verification.

---

## 10. Git Collaboration Guidelines

### Branching

- `main` is always stable and runnable; changes arrive through pull requests.
- Branch from an up-to-date `main`: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/` (e.g. `feature/user-registration`).

```powershell
git switch main
git pull origin main
git switch -c feature/your-feature
git add .
git commit -m "feat: add product listing endpoint"
git fetch origin
git rebase origin/main          # or: git merge origin/main
git push -u origin feature/your-feature
# then open a Pull Request on GitHub into main
```

### Commit messages and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `chore:`, imperative mood.
- Keep PRs small. Before opening one, `.\mvnw.cmd clean verify`, `npm run lint` and `npm run build` must pass. A
  teammate reviews before merging.

### Never commit

- `UniMarket-Backend/.env`, `UniMarket-Frontend/.env.local` or any file with real credentials (DB password, Gmail App
  Password, JWT or other secrets)
- `target/`, `node_modules/`, `dist/`, `uploads/`, database backups
- IDE settings (`.idea/`, personal `.vscode/` files)

If a secret is committed by mistake, **change it immediately**; deleting the file later does not remove it from Git
history. `.gitattributes` keeps `mvnw` with LF endings and `*.cmd` with CRLF.

---

## 11. Coding Conventions

- **Java:** classes `PascalCase`, methods / variables `camelCase`, packages `lowercase`, constants `UPPER_SNAKE_CASE`.
  Controllers stay thin; business logic in services; data access in repositories and stored procedures. Never expose
  JPA entities from controllers, use DTOs. Configuration in `config/` and `application*.properties`.
- **Money rules live in the database** (commission, payout, settlement): the backend reads them, never recalculates.
- **React:** components and pages in `PascalCase.jsx`, hooks `useSomething.js`, all HTTP calls through `src/services/`,
  user-facing text through `useTranslation` (Vietnamese phrases in `src/i18n/messages/`).
- **Styling:** Tailwind classes with UniMarket design tokens (section 8). No inline hex colors.
