# UniMarket

UniMarket is a full-stack web marketplace application built with a **Spring Boot** REST API, a **React (Vite)** single-page frontend and a **Microsoft SQL Server** database.

> **Status:** project foundation only. The backend exposes a health-check endpoint and the frontend shows the backend connection status. Business features (authentication, products, orders, etc.) are not implemented yet.

---

## 1. Technology Stack

| Layer      | Technology                                                        |
|------------|-------------------------------------------------------------------|
| Backend    | Java 21, Spring Boot 3.5 (Web, Data JPA, Validation), Maven       |
| Database   | Microsoft SQL Server (2019/2022), `mssql-jdbc` driver             |
| Frontend   | React 19, Vite 8, Tailwind CSS 4, React Router, Axios, ESLint     |
| UI         | Inter font (self-hosted), shared design tokens in `src/index.css` |
| API style  | RESTful JSON, all endpoints under `/api`                          |
| Tooling    | Git & GitHub, Visual Studio Code, Windows PowerShell              |

Backend architecture is **layered**: `controller → service → repository → entity`, with `dto` objects used for API input/output.

---

## 2. Project Structure

```text
UniMarket/
├── UniMarket-Backend/               Spring Boot REST API
│   ├── .mvn/wrapper/                Maven wrapper configuration (no global Maven needed)
│   ├── src/main/java/com/unimarket/
│   │   ├── controller/              REST controllers (thin: HTTP only)
│   │   ├── service/                 Business logic
│   │   ├── repository/              Spring Data JPA repositories
│   │   ├── entity/                  JPA entities (mapped to UniMarketDB tables)
│   │   ├── dto/                     Request/response objects
│   │   ├── config/                  Spring configuration classes
│   │   └── UniMarketApplication.java
│   ├── src/main/resources/
│   │   ├── application.properties       Main config (reads env variables)
│   │   └── application-nodb.properties  Profile to run without a database
│   ├── src/test/java/com/unimarket/     Tests
│   ├── .env.example                 Example DB configuration (copy to .env)
│   ├── pom.xml
│   └── mvnw / mvnw.cmd              Maven wrapper scripts
├── UniMarket-Frontend/              React + Vite SPA
│   ├── public/
│   ├── src/
│   │   ├── assets/                  Images, fonts, static files
│   │   ├── components/              Reusable UI components
│   │   ├── pages/                   Route-level pages
│   │   ├── services/                API calls (Axios)
│   │   ├── hooks/                   Custom React hooks
│   │   ├── App.jsx                  Routes
│   │   └── main.jsx                 Entry point
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js               Dev server + /api proxy
├── database/
│   └── schema.sql                   Idempotent database creation script
├── .vscode/extensions.json          Recommended VS Code extensions for the team
├── .gitattributes
├── .gitignore
└── README.md
```

---

## 3. Required Software

| Software                      | Version         | Check with          |
|-------------------------------|-----------------|---------------------|
| JDK                           | **21** (LTS)    | `java -version`     |
| Node.js                       | **22.22+** (LTS)| `node -v`           |
| npm                           | 10+             | `npm -v`            |
| Microsoft SQL Server          | 2019 or 2022    | SSMS / `sqlcmd`     |
| Git                           | any recent      | `git --version`     |
| Visual Studio Code (suggested)| latest          |                     |

Maven does **not** need to be installed: use the included wrapper (`mvnw.cmd`), which downloads Maven 3.9 automatically.

Recommended VS Code extensions (VS Code offers to install them from `.vscode/extensions.json`): *Extension Pack for Java*, *Spring Boot Extension Pack*, *ESLint*, *Tailwind CSS IntelliSense*, *SQL Server (mssql)*.

### JDK 21 on Windows

Install [Eclipse Temurin 21](https://adoptium.net/temurin/releases/?version=21) (or any JDK 21) and set `JAVA_HOME`. If you have several JDKs, you can point a single PowerShell session at JDK 21:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.x-hotspot"   # adjust to your install path
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version   # must show 21
```

---

## 4. Database Setup (SQL Server)

### 4.1 Create the database

`database/schema.sql` creates `UniMarketDB` if it does not exist. It is safe to re-run and **never drops** existing objects.

```powershell
# Default instance, Windows authentication
sqlcmd -S localhost -E -i database\schema.sql

# Named instance (e.g. SQLEXPRESS)
sqlcmd -S "localhost\SQLEXPRESS" -E -i database\schema.sql
```

You can also open `database/schema.sql` in SSMS or the VS Code *mssql* extension and execute it.

### 4.2 Create a SQL login for the application

The backend connects with **SQL Server Authentication**. In SSMS (as an administrator), run something like the following, using your own strong password:

```sql
CREATE LOGIN unimarket_app WITH PASSWORD = '<choose-a-strong-password>';
USE UniMarketDB;
CREATE USER unimarket_app FOR LOGIN unimarket_app;
ALTER ROLE db_datareader ADD MEMBER unimarket_app;
ALTER ROLE db_datawriter ADD MEMBER unimarket_app;
```

Requirements on the server:

- **Mixed mode authentication** enabled (SSMS → Server Properties → Security → *SQL Server and Windows Authentication mode*), then restart the service.
- **TCP/IP** enabled (SQL Server Configuration Manager → SQL Server Network Configuration → Protocols → TCP/IP → *Enabled*). Note the port (default `1433`; named instances often use a dynamic port, so set a fixed one under *IPAll → TCP Port*).

### 4.3 Configure credentials (never commit them)

The backend reads these variables. They are never hard-coded:

| Variable             | Description                                       | Default                                   |
|----------------------|---------------------------------------------------|-------------------------------------------|
| `DB_URL`             | JDBC URL                                          | `jdbc:sqlserver://localhost:1433;databaseName=UniMarketDB;encrypt=true;trustServerCertificate=true` |
| `DB_USERNAME`        | SQL login                                         | *(none)*                                  |
| `DB_PASSWORD`        | SQL password                                      | *(none)*                                  |
| `HIBERNATE_DDL_AUTO` | Hibernate schema mode                             | `validate`                                |
| `SERVER_PORT`        | API port                                          | `8080`                                    |

**Option A: `.env` file (recommended).** Copy the example and edit it. `UniMarket-Backend/.env` is git-ignored.

```powershell
cd UniMarket-Backend
Copy-Item .env.example .env
notepad .env
```

**Option B: environment variables in the current PowerShell session.** These take precedence over `.env`.

```powershell
$env:DB_URL      = "jdbc:sqlserver://localhost:1433;databaseName=UniMarketDB;encrypt=true;trustServerCertificate=true"
$env:DB_USERNAME = "unimarket_app"
$env:DB_PASSWORD = "<your-password>"
```

> `trustServerCertificate=true` is for **local development only**. Use a trusted certificate in shared or production environments.

### 4.4 Schema management policy

- `spring.jpa.hibernate.ddl-auto=validate`: Hibernate only **checks** that entities match existing tables. It never creates, alters or drops anything.
- All table changes go into `database/schema.sql` using the `IF OBJECT_ID(...) IS NULL` pattern shown in the file.
- Never use `create` or `create-drop` against a shared database.

---

## 5. Backend Setup and Run

All commands are run from the `UniMarket-Backend` folder in PowerShell.

```powershell
cd UniMarket-Backend

# Compile and run tests
.\mvnw.cmd clean verify

# Run with SQL Server (requires section 4)
.\mvnw.cmd spring-boot:run

# Run WITHOUT a database (health check / frontend connectivity only)
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=nodb"
```

The API starts on **http://localhost:8080**. Test it:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
# or
curl.exe http://localhost:8080/api/health
```

Expected response:

```json
{ "status": "UP", "application": "UniMarket" }
```

**No SQL Server available?** Use the `nodb` profile shown above. It disables the DataSource and JPA auto-configuration so the application starts without a database. Without it, startup fails with a clear error such as `Login failed for user ''` when credentials are missing or the server is unreachable.

Run the packaged JAR instead:

```powershell
.\mvnw.cmd clean package
java -jar target\unimarket-backend-0.0.1-SNAPSHOT.jar                                   # with database
java -jar target\unimarket-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=nodb    # without database
```

---

## 6. Frontend Setup and Run

From the `UniMarket-Frontend` folder:

```powershell
cd UniMarket-Frontend
npm install        # first time, or after package.json changes
npm run dev        # http://localhost:5173
```

Other scripts:

```powershell
npm run lint       # ESLint
npm run build      # production build into UniMarket-Frontend\dist
npm run preview    # serve the production build on http://localhost:4173
```

### How the frontend talks to the backend

The Vite dev server **proxies** every request starting with `/api` to `http://localhost:8080`. Frontend code always calls relative URLs (`/api/...`, via `src/services/apiClient.js`), so the browser sees a single origin and **no CORS configuration is needed** in development.

To point the proxy at a different backend, create `UniMarket-Frontend/.env.local`:

```text
VITE_BACKEND_URL=http://localhost:9090
```

### Sample product data (until the product API exists)

The product backend (and its SQL Server schema) is not ready yet, so the marketplace pages use **sample data** in development:

| Command          | Product data                                   |
|------------------|------------------------------------------------|
| `npm run dev`    | Sample data from `src/mocks/` (pages show a yellow *Sample data* notice) |
| `npm run build`  | Real API (`src/services/products/productApi.js`); the mock files are **not** included in the build |

- Override with `VITE_USE_MOCK_DATA=true|false` in `UniMarket-Frontend/.env.local`.
- Pages only use `productService` (`src/services/products/productService.js`); `vite.config.js` points it to the mock or the real implementation.
- Sample data is read-only: *Publish*, *Save changes* and *Delete* validate the input and then clearly report **"Preview only"**. Nothing is stored.
- To test states in development, add `?simulate=slow` or `?simulate=error` to a marketplace URL.

- **Orders (sample data):** cart → checkout → confirmation → *My orders* follows the Business Plan flow (seller confirms within 24 h → buyer pays online → seller delivers → buyer confirms receipt). Sample orders live in memory and reset on reload; payments are **simulated**. In *My orders*, “Simulate … step” buttons play the other person’s step so one person can try both sides.
- **Cart:** stored in this browser (`localStorage`, listing IDs only) until a backend cart exists.

Routes:

| Area | Routes |
|------|--------|
| Marketplace | `/marketplace` (filters in the URL), `/products/:id`, `/deals` |
| Selling | `/sell`, `/my-listings`, `/my-listings/:id/edit` |
| Buying | `/cart`, `/checkout?items=…`, `/orders/confirmation?ids=…`, `/orders` (`?view=sales` for sales), `/messages` |
| Information | `/how-it-works`, `/safety`, `/help`, `/about`, `/contact`, `/ambassadors`, `/privacy`, `/terms` |
| Account | `/login`, `/register` |

Pages other than the homepage and sign-in are code-split and loaded on first visit.

### Styling: Tailwind CSS and design tokens

The frontend uses **Tailwind CSS v4** through the official Vite plugin (`@tailwindcss/vite`). There is no `tailwind.config.js`: all UniMarket design tokens live in the `@theme` block of `UniMarket-Frontend/src/index.css`, and each token automatically becomes a Tailwind class.

| Token                    | Example classes                     | Value     | Status              |
|--------------------------|-------------------------------------|-----------|---------------------|
| `--font-sans`            | `font-sans` (default)               | Inter     | Confirmed (Figma)   |
| `--color-primary`        | `bg-primary`, `text-primary`        | `#2459E0` | Confirmed (Figma)   |
| `--color-primary-hover`  | `hover:bg-primary-hover`            | `#1D47B8` | Proposed            |
| `--color-primary-soft`   | `bg-primary-soft`                   | `#EAF0FC` | Proposed            |
| `--color-canvas`         | `bg-canvas` (page background)       | `#F8FAFD` | Proposed            |
| `--color-surface`        | `bg-surface` (cards, inputs)        | `#FFFFFF` | Proposed            |
| `--color-ink`            | `text-ink` (main text)              | `#172033` | Proposed            |
| `--color-ink-muted`      | `text-ink-muted` (secondary text)   | `#64748B` | Proposed            |
| `--color-line`           | `border-line`                       | `#E2E8F0` | Proposed            |
| `--color-success` / `-soft` | `text-success`, `bg-success-soft` | `#16A34A` | Proposed            |
| `--color-warning` / `-soft` | `text-warning`, `bg-warning-soft` | `#F59E0B` | Proposed            |
| `--color-danger` / `-soft`  | `text-danger`, `bg-danger-soft`   | `#DC2626` | Proposed            |
| `--radius-control`       | `rounded-control` (buttons, inputs) | `0.5rem`  | Proposed            |
| `--radius-card`          | `rounded-card` (cards, panels)      | `0.75rem` | Proposed            |

"Proposed" values have not been checked against Figma yet. When they are, update them in `index.css` only.

Rules:

- Style components with Tailwind classes. Add regular CSS to `index.css` only when Tailwind cannot express it.
- Use the token classes (`text-ink`, `bg-primary`) instead of raw hex values or Tailwind's default palette (`text-gray-700`, `bg-blue-600`), so colors stay consistent.
- Use Tailwind's default spacing scale (`p-4`, `gap-3`, …) and its mobile-first breakpoints (`sm:`, `md:`, `lg:`).

---

## 7. Running the Whole Project

Use two PowerShell terminals:

```powershell
# Terminal 1: backend
cd UniMarket-Backend
.\mvnw.cmd spring-boot:run            # add "-Dspring-boot.run.profiles=nodb" if no database

# Terminal 2: frontend
cd UniMarket-Frontend
npm run dev
```

Open **http://localhost:5173**. The homepage shows *"Welcome to UniMarket"*, *"Project initialized successfully"* and the backend connection status (*"Backend connected: UniMarket is UP"*).

| Service       | URL                                  |
|---------------|--------------------------------------|
| Frontend      | http://localhost:5173                |
| Backend       | http://localhost:8080                |
| Health check  | http://localhost:8080/api/health     |

---

## 8. Git Collaboration Guidelines

### Branching

- `main`: always stable and runnable. No direct pushes; changes arrive through pull requests.
- Create a branch from an up-to-date `main` for every task:

| Prefix       | Use for                          | Example                     |
|--------------|----------------------------------|-----------------------------|
| `feature/`   | new functionality                | `feature/user-registration` |
| `fix/`       | bug fixes                        | `fix/product-price-rounding`|
| `refactor/`  | code changes without behavior change | `refactor/order-service` |
| `docs/`      | documentation only               | `docs/api-endpoints`        |
| `chore/`     | build, dependencies, config      | `chore/upgrade-spring-boot` |

### Typical workflow (PowerShell)

```powershell
git switch main
git pull origin main
git switch -c feature/your-feature

# ... work, then commit small logical changes
git add .
git commit -m "feat: add product listing endpoint"

# keep your branch up to date before opening a PR
git fetch origin
git rebase origin/main          # or: git merge origin/main

git push -u origin feature/your-feature
# then open a Pull Request on GitHub into main
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. Use the imperative mood, e.g. `fix: handle empty cart on checkout`.

### Pull requests

- Keep PRs small and focused on one task.
- Before opening a PR, make sure `.\mvnw.cmd clean verify`, `npm run lint` and `npm run build` pass.
- At least one teammate reviews and approves before merging.
- Resolve conflicts in your branch, not in `main`.

### Never commit

- `UniMarket-Backend/.env`, `UniMarket-Frontend/.env.local` or any file containing real credentials
- `target/`, `node_modules/`, `dist/`
- IDE settings (`.idea/`, personal `.vscode/` files)

If a secret is committed by mistake, **change the password immediately**. Deleting the file in a later commit does not remove it from Git history.

### Line endings

`.gitattributes` keeps `mvnw` with LF endings (so it runs on Linux/macOS) and `*.cmd` with CRLF. On Linux/macOS, make the wrapper executable once if needed: `chmod +x UniMarket-Backend/mvnw`.

---

## 9. Coding Conventions

- **Java:** classes `PascalCase`, methods/variables `camelCase`, packages `lowercase`, constants `UPPER_SNAKE_CASE`.
- Controllers stay thin. Business logic goes in services, data access in repositories.
- Never expose JPA entities directly from controllers. Use DTOs.
- Configuration goes in `config/` and `application*.properties`, never mixed with business logic.
- **React:** components and pages in `PascalCase.jsx`, hooks named `useSomething.js`, all HTTP calls go through `src/services/`.
- **Styling:** Tailwind classes with UniMarket design tokens (see section 6, *Styling*). No inline hex colors.
