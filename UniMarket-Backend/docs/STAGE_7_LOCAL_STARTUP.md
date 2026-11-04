# UniMarket — Local startup guide (Windows / VS Code)

## Official demo — one command

```powershell
cd D:\Minus\UniMarket
powershell -ExecutionPolicy Bypass -File .\start-unimarket-demo.ps1     # start (≈ 1–2 minutes)
powershell -ExecutionPolicy Bypass -File .\stop-unimarket-demo.ps1      # stop everything UniMarket
```

`start-unimarket-demo.ps1` checks SQL Server, `UniMarketJava` (ONLINE, migrations V001–V003) and that a verified backup
exists (creates a new `COPY_ONLY` backup with a unique name when the latest is older than 24 h), checks the
configuration in `UniMarket-Backend\.env` (presence only), stops any other UniMarket backend / Vite process, starts the
backend on **8080** from an immutable JAR copy (`-OfficialDemo`: real Gmail SMTP, simulated payments and delivery,
`ddl-auto=validate`, order expiry OFF) and Vite on **5173** (`VITE_BACKEND_URL=http://localhost:8080`, real APIs), then
verifies the database the backend is really connected to, the frontend proxy and the sign-in smoke test. Open
**http://localhost:5173**. Both servers run detached (hidden, own process group): closing the terminal does not stop
them; logs are in `%LOCALAPPDATA%\UniMarket\logs\`. Gmail SMTP is checked at startup (`SMTP check: login … succeeded`).

Prerequisites: SQL Server service `MSSQL$MSSQLSERVER09` running, JDK 21 (`JAVA_HOME` or `%USERPROFILE%\.jdks\jdk-21*`),
Node.js with `npm install` done in `UniMarket-Frontend`, and `UniMarket-Backend\.env` with `DB_USERNAME`, `DB_PASSWORD`,
`MAIL_USERNAME`, `MAIL_PASSWORD` (Google App Password), `MAIL_FROM`. `JWT_SECRET` is optional in the dev profile (a
random key per start: everyone signs in again after a restart).

The sections below describe the individual steps and the test / rehearsal mode on database clones.

Two modes, never mixed:

| Mode | Database | Backend / frontend | Writes allowed |
|---|---|---|---|
| **Stage 7 test / rehearsal** | a clone, e.g. `UniMarketJava_Stage7ReadyTest` | 8083 / 5175 (any free pair) | yes, on the clone only |
| **Official demo** | `UniMarketJava` (main) | 8080 / 5173 | only the live demo itself; never automated tests |

> `application.properties` falls back to **`UniMarketJava`** when `DB_URL` is not set. Always start the backend with
> `docs/scripts/start-backend.ps1`, which sets `DB_URL` explicitly and refuses the main database unless `-OfficialDemo`.

Secrets (DB login, `JWT_SECRET`, `SHIPPING_QUOTE_SECRET`, Gmail App Password) live only in the git-ignored
`UniMarket-Backend/.env` (see `.env.example`). Never put them in scripts, commands or chat.

## 1. SQL Server

```powershell
Get-Service | Where-Object Name -like 'MSSQL*'          # MSSQL$MSSQLSERVER09 must be Running
Start-Service 'MSSQL$MSSQLSERVER09'                      # if stopped (admin PowerShell)
sqlcmd -S "localhost\MSSQLSERVER09" -E -C -Q "SELECT name, state_desc FROM sys.databases WHERE name LIKE 'UniMarketJava%'"
```

The JDBC URL uses TCP `localhost:1433`; `sqlcmd` uses the named instance `localhost\MSSQLSERVER09`. Both must point to
the same instance (`SELECT @@SERVERNAME`).

## 2. Backend (Spring Boot, Java 21)

```powershell
cd D:\Minus\UniMarket\UniMarket-Backend\docs\scripts
# Stage 7 test mode (clone), frontend on 5175:
.\start-backend.ps1 -Database UniMarketJava_Stage7ReadyTest -Port 8083 -FrontendPort 5175
```

The script sets `DB_URL`, `SERVER_PORT`, `CORS_ALLOWED_ORIGINS=http://localhost:<FrontendPort>`, `MAIL_MODE`
(`smtp` with `-OfficialDemo`, otherwise `log`: OTP codes appear in this console; it refuses to start when the SMTP
settings are missing), refuses a port that is already in use or a database another backend is connected to, `ORDER_EXPIRY_ENABLED=false`, `PAYMENT_SIMULATOR_ENABLED=true` and a per-database
`UPLOAD_DIR` (git-ignored), builds the JAR (`mvnw package -DskipTests`) and runs a **copy** of it from
`%LOCALAPPDATA%\UniMarket\run\` with `java -jar`. Ready when the console prints `Started UniMarketApplication`.

Do not start the backend with `mvnw spring-boot:run` while you also build or run tests: spring-boot:run loads classes
lazily from `target/classes`, a later `mvnw test` rewrites that folder, and a class first needed at that moment fails to
load for the rest of the process life (seen as **every wrong-password sign-in answering HTTP 500**). The JAR copy is
not affected by later builds. Use `-MailMode smtp` only when the Gmail settings in `.env` are complete.

**CORS:** the backend accepts browser requests only from the origin in `CORS_ALLOWED_ORIGINS` (default
`http://localhost:5173`). A frontend on another port without the matching `-FrontendPort` fails every sign-in with
`403 Invalid CORS request`.

## 3. Frontend (Vite)

```powershell
cd D:\Minus\UniMarket\UniMarket-Frontend
$env:VITE_BACKEND_URL = 'http://localhost:8083'   # the backend port from step 2
$env:VITE_AUTH_MODE   = 'backend'                 # real sign-in; products, orders and admin then use the real API
npx vite --port 5175 --strictPort
```

Open **http://localhost:5175**. (Environment variables win over `UniMarket-Frontend/.env.local`.)

## 4. Verify before using it

```powershell
cd D:\Minus\UniMarket\UniMarket-Backend\docs\scripts
.\check-active-db.ps1 -Port 8083 -Expect UniMarketJava_Stage7ReadyTest   # exit code 1 if it is any other database
.\smoke-login.ps1 -BaseUrl http://localhost:5175                          # wrong sign-ins must be 401, never 500
Invoke-RestMethod http://localhost:5175/api/products?size=1 | Select-Object totalItems   # frontend proxy -> backend
```

In the browser: the bottom-right badge shows **API online**, the marketplace lists listings with "Reference photo"
tags, and the Vite console prints `[unimarket] /api -> http://localhost:8083 | auth mode: backend | products: backend |
orders: backend | admin & community: backend`.

## 5. Stop safely

`Ctrl+C` in the backend and the Vite terminals. If a terminal was closed:

```powershell
Get-NetTCPConnection -LocalPort 8083,5175 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
Stop-Process -Id <PID>        # only the PID you started
```

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sign-in fails, browser console `403` on `/api/auth/login` | CORS: restart the backend with `-FrontendPort` = the Vite port |
| Correct password works but any wrong password shows "Something went wrong on our side" (HTTP 500); backend log `NoClassDefFoundError` | the backend ran from `target/classes` while a build rewrote it: restart it with `start-backend.ps1` (JAR mode); check with `smoke-login.ps1` |
| `Port 8083 was already in use` | another backend runs there: `check-active-db.ps1 -Port 8083`, stop it or choose another port |
| `Login failed for user` / `Cannot open database` | wrong DB credentials in `.env` or the database name does not exist / is offline |
| `Schema-validation: missing column/table` | the database is not at V003 — use a clone of the current main, never run migrations on main |
| `JAVA_HOME is not set` | install JDK 21 or set `$env:JAVA_HOME` before running the script |
| OTP e-mail never arrives | expected with `MAIL_MODE=log`: read the code in the backend console (`DEV E-MAIL`) |
| Frontend shows sample data | `VITE_AUTH_MODE` was not `backend` when Vite started |
| Images 404 | the 12 listings without a reference photo show a placeholder by design (see `photos/CREDITS.md`) |

## 7. Switching to the official demo database (`UniMarketJava`) — needs explicit approval

The backend (current `main`) validates against the main schema: main and its clones are schema-identical (V001–V003,
`ddl-auto=validate`). Switching changes **which data the live demo writes to**, nothing else:

1. Stop the clone backend and its Vite server.
2. `.\start-backend.ps1 -Database UniMarketJava -Port 8080 -FrontendPort 5173 -OfficialDemo`
3. `$env:VITE_BACKEND_URL='http://localhost:8080'; $env:VITE_AUTH_MODE='backend'; npx vite --port 5173 --strictPort`
4. `.\check-active-db.ps1 -Port 8080 -Expect UniMarketJava`
5. Do not run any automated test script in this mode; take a `COPY_ONLY` backup to a NEW file before the demo if the
   demo data must be restorable.
