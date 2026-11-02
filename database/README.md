# UniMarket database (SQL Server)

Written for: team members who install, change or test the UniMarket database.

The database is **`UniMarketJava`** on SQL Server 2019+ (developed on SQL Server 2022).
The Spring Boot backend only validates it (`ddl-auto=validate`); every schema change is a SQL file here.

## Folder layout

| Path | What it is | Run on the live database? |
|---|---|---|
| `baseline/V001__UniMarket_BusinessAligned.sql` | Original installer: creates `UniMarketJava` with tables, views, procedures, triggers and demo data. Byte-identical to the script that was executed. | Only to create a **new** database. It refuses to run if `UniMarketJava` exists. |
| `migrations/V002__multi_item_orders.sql` | **Applied to UniMarketJava on 2026-11-02.** Changes orders to **Orders + OrderItems** (one order per seller, several items) and implements business rules D1–D6 (delivery fee to seller, 24 h payment deadline, manual disputes, 3 % commission, order reviews, admin-confirmed payouts). Already applied – do **not** run again (it refuses). For a new database: run after V001. |
| `validation/V002_pre_migration_checks.sql` | Read-only checks before V002. | Yes (read-only). |
| `validation/V002_post_migration_checks.sql` | Read-only checks after V002. | Yes (read-only). |
| `tests/create_test_copy.sql` | Makes a disposable copy from a COPY_ONLY backup. | Reads the source only. |
| `tests/V002_order_scenarios_test.sql` | 29 business scenarios (checkout, duplicates, rollback, commission…). | **Never**. Refuses unless the database name contains `Test`. |
| `tests/V002_business_rules_D1_D6_test.sql` | 49 checks for D1–D6 (money, deadline, disputes, reviews, settlements, demo data). | **Never**. Refuses unless the database name contains `Test`. |
| `tests/V002_seller_confirmation_test.sql` | 9 checks for the 24-hour seller confirmation window (Business Plan 3.4) and its independence from the payment deadline. | **Never**. Refuses unless the database name contains `Test`. |
| `tests/V002_concurrency_test.ps1` | Six races with two real sessions: same listing, payment vs expiry, expiry vs payment start, expiry beyond grace vs late callback, seller confirmation vs expiry (both orders). | **Never** (test copies only). |
| `tests/run_v002_tests.ps1` | Runs everything above on fresh copies, including a half-way failure test, and proves the source is unchanged. | Reads the source only. |
| `tests/fingerprint.sql` | Schema checksum + row counts, to prove "nothing changed". | Yes (read-only). |
| `schema/describe_schema.sql` | Prints a Markdown schema reference from the live catalog. | Yes (read-only). |
| `schema/SCHEMA_REFERENCE_after_V002.md` | Generated reference of the **current live schema** (V001 + V002), from `UniMarketJava`. | – |
| `docs/V002_multi_item_orders.md` | Design of the order model, decisions D1–D6, state rules, how to apply. | – |
| `docs/BUSINESS_PLAN_TRACEABILITY.md` | Business Plan requirement → SQL → tests → status, and what belongs to later stages. | – |
| `legacy/schema_foundation_placeholder.sql` | Old empty `UniMarketDB` placeholder. **Not used.** | No. |

Applied migrations are recorded in `dbo.SchemaMigrations` (created by V002).

## Rules

- Never use Hibernate `create`, `create-drop` or `update`. Never drop or recreate `UniMarketJava`.
- Migrations are numbered (`V003__...sql`), run once, inside one transaction, with a precondition check and
  a verification step that rolls back on any difference.
- Test on a copy first: `tests\run_v002_tests.ps1` (or the same pattern for later migrations).
- No credentials or machine-specific paths in these files; pass them as sqlcmd variables or parameters.
- Demo accounts in V001 are fictional; their password hash is for local demos only.

## Running scripts

Always use SQLCMD mode and `QUOTED_IDENTIFIER ON` (`-I`), because V002 creates an indexed view:

```powershell
# read-only checks
sqlcmd -S "localhost\MSSQLSERVER09" -E -C -I -d UniMarketJava -W -s "|" -i database\validation\V002_pre_migration_checks.sql

# full verification on disposable copies (does not modify UniMarketJava)
.\database\tests\run_v002_tests.ps1 -Server "localhost\MSSQLSERVER09" -Source "UniMarketJava"
```

The exact steps for applying V002 to the live database are in `docs/V002_multi_item_orders.md`, section 8.
