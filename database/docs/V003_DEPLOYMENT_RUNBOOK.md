# V003 deployment runbook (UniMarketJava)

Written for: the team member who applies V003 to the real `UniMarketJava` database after the team approves it.

Status: **EXECUTED on `UniMarketJava` on 2026-11-03 09:24 (+07:00), exit 0, all checks passed — see section 10.**
Every step was rehearsed on isolated copies on 2026-11-03 (results in
`V003_DESIGN_nationwide_and_simulated_shipping.md`, section 11). Do not start without the written approval of step 0.

Conventions: PowerShell on the database machine, instance `localhost\MSSQLSERVER09`, Windows authentication.
Every `sqlcmd` call that reads a project `.sql` file uses **`-f 65001`** (the files are UTF-8; the migration refuses to
run otherwise). Keep every output file of this runbook in one folder, e.g. `D:\Deploy\V003-<date>\`.

```powershell
$Srv = "localhost\MSSQLSERVER09"; $Db = "UniMarketJava"; $Repo = "D:\Minus\UniMarket"
$Out = "D:\Deploy\V003-$(Get-Date -Format yyyyMMdd-HHmm)"; New-Item -ItemType Directory -Force $Out | Out-Null
$Bak = "C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER09\MSSQL\Backup\UniMarketJava_preV003_$(Get-Date -Format yyyyMMdd-HHmm).bak"
```

## 0. Approval (stop if missing)

- Written team approval to apply V003 to `UniMarketJava` (this is the only thing that allows `ProductionApproval="YES"`).
- Approved together: the backend version that needs V003, `SHIPPING_QUOTE_SECRET`, a maintenance window during which
  nobody uses the demo.

## 1. Pre-deployment checks (all read-only)

```powershell
# 1.1 The scripts are exactly the tested ones (expected values in database/migrations/V003.sha256).
Get-Content "$Repo\database\migrations\V003.sha256"
Get-FileHash "$Repo\database\migrations\V003__nationwide_registration_and_simulated_shipping.sql","$Repo\database\migrations\V003_rollback.sql" -Algorithm SHA256
#    migration 98585f470e7bd472c1d1ea27c57b627a2792a5ea1653d9f984ec61df62fd1d3c
#    rollback  6ef306dc852431c619a1bfee076e74e84072c848d19b401ce0244a165e43e07f      -> any difference: STOP

# 1.2 The database is still V001 + V002 and nobody is connected.
sqlcmd -S $Srv -E -C -W -d $Db -Q "SET NOCOUNT ON; SELECT STRING_AGG(Version, ',') FROM dbo.SchemaMigrations;
  SELECT session_id, login_name, program_name FROM sys.dm_exec_sessions WHERE database_id = DB_ID('$Db') AND session_id <> @@SPID"
#    expected: V001,V002 and no session. Stop the backend (and any IDE / sqlcmd session) first.

# 1.3 Baseline of the existing data (section A must be identical after the migration).
sqlcmd -S $Srv -E -C -I -W -s "|" -f 65001 -d $Db -i "$Repo\database\validation\V003_pre_post_checks.sql" -o "$Out\checks-pre.txt"
```

Expected in `checks-pre.txt` section B: `migrations|V001,V002`, `V003 objects present (of 4)|0`, 0 untrusted FKs /
CHECKs. Section A contains `legacy|V001 settlements (no shipping)|4` (orders 1–4, approved V001 treatment, see section 9).

## 2. Full backup WITH CHECKSUM

```powershell
sqlcmd -S $Srv -E -C -b -Q "BACKUP DATABASE [$Db] TO DISK = N'$Bak' WITH COPY_ONLY, CHECKSUM, INIT, NAME = N'$Db before V003'"
```

COPY_ONLY keeps any existing backup chain untouched. Do not delete older backups.

## 3. RESTORE VERIFYONLY and restore verification

```powershell
# 3.1 Backup readable, page checksums valid.
sqlcmd -S $Srv -E -C -b -Q "RESTORE VERIFYONLY FROM DISK = N'$Bak' WITH CHECKSUM"

# 3.2 Real restore under another name (never over UniMarketJava), integrity check, same data as the source.
#     create_test_copy.sql takes its own COPY_ONLY backup; to restore THIS file instead, use RESTORE FILELISTONLY + MOVE:
sqlcmd -S $Srv -E -C -W -Q "RESTORE FILELISTONLY FROM DISK = N'$Bak'"      # expected logical names: UniMarketJava, UniMarketJava_log
$DataDir = (sqlcmd -S $Srv -E -C -h -1 -W -Q "SET NOCOUNT ON; SELECT SERVERPROPERTY('InstanceDefaultDataPath')").Trim()
sqlcmd -S $Srv -E -C -b -Q "IF DB_ID(N'UniMarketJava_PreV003Verify') IS NOT NULL THROW 51950, 'Verify DB exists; drop it explicitly first.', 1;
  RESTORE DATABASE [UniMarketJava_PreV003Verify] FROM DISK = N'$Bak' WITH CHECKSUM,
  MOVE N'UniMarketJava' TO N'${DataDir}UniMarketJava_PreV003Verify.mdf',
  MOVE N'UniMarketJava_log' TO N'${DataDir}UniMarketJava_PreV003Verify_log.ldf'"
sqlcmd -S $Srv -E -C -b -Q "DBCC CHECKDB([UniMarketJava_PreV003Verify]) WITH NO_INFOMSGS"
sqlcmd -S $Srv -E -C -I -W -s "|" -f 65001 -d UniMarketJava_PreV003Verify -i "$Repo\database\validation\V003_pre_post_checks.sql" -o "$Out\checks-verify.txt"
Compare-Object (Get-Content "$Out\checks-pre.txt") (Get-Content "$Out\checks-verify.txt")   # expected: no output
```

Keep `UniMarketJava_PreV003Verify` until the deployment is accepted (it is also a ready rollback source). If any
command in 2–3 fails or the comparison shows a difference: **STOP, do not migrate.**

## 4. Migration (approval and target checks are inside the script)

```powershell
sqlcmd -S $Srv -E -C -I -b -f 65001 -d $Db `
  -i "$Repo\database\migrations\V003__nationwide_registration_and_simulated_shipping.sql" `
  -v Approved="YES" TargetDb="UniMarketJava" ProductionApproval="YES" *> "$Out\migration.log"
"exit=$LASTEXITCODE"; Get-Content "$Out\migration.log" -Tail 5
```

Expected: `exit=0` and the last line `V003 applied and verified: existing rows, money totals and catalog rows unchanged.`
The script refuses (and changes nothing) when: the file is read with a wrong code page, `Approved` / `TargetDb` /
`ProductionApproval` do not match, V002 is missing, V003 is already recorded or its objects exist. Any later failure rolls
the whole migration back (one transaction). A non-zero exit code means V003 is NOT applied — check with 1.2, keep the
backend on the previous version, investigate.

## 5. Post-migration schema / data validation

```powershell
sqlcmd -S $Srv -E -C -I -W -s "|" -f 65001 -d $Db -i "$Repo\database\validation\V003_pre_post_checks.sql" -o "$Out\checks-post.txt"
$pre = Get-Content "$Out\checks-pre.txt"; $post = Get-Content "$Out\checks-post.txt"
Compare-Object $pre[0..($pre.IndexOf('=== B. Schema state ===')-1)] $post[0..($post.IndexOf('=== B. Schema state ===')-1)]   # expected: no output
$post[$post.IndexOf('=== B. Schema state ===')..($post.Count-1)]
```

Expected section B: `migrations|V001,V002,V003`; `V003 objects present (of 4)|4`; 0 untrusted / disabled FKs and
CHECKs; `provider CHECKs allowing BankQR|3`; `zones|21`; `campuses without zone|0`; `catalog rows without area|0`;
`quotes|0`; `users without campus|0`; the four `unimarket_app can …` rows `1`. Also run
`database/tests/V003_financial_checks.sql` (read-only): every violation count `0`.

## 6. Backend startup and health checks

1. Deploy the backend build that contains V003 support (it does not start on a V002 database, and the previous build
   does not know the V003 contract — never run the old build against V003 for checkout).
2. Configuration: `DB_URL` → `UniMarketJava`; `spring.jpa.hibernate.ddl-auto=validate` (unchanged); for local demo
   use `ORDER_EXPIRY_ENABLED=false` (dev default); set `SHIPPING_QUOTE_SECRET` (and `JWT_SECRET`,
   `VERIFICATION_CODE_SECRET`, `PAYMENT_SIMULATOR_SECRET`) to Base64 of ≥ 32 random bytes in the git-ignored `.env`, e.g.
   `$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`
   (cryptographic RNG; never `Get-Random`) — never print, log or commit them.
   Without them the `dev` profile uses a random key per run (quotes / tokens die on restart); other profiles refuse to start.
3. Start, then check:

```powershell
curl.exe -s http://localhost:8080/actuator/health          # {"status":"UP"}
curl.exe -s http://localhost:8080/api/health               # "database":"UP"
curl.exe -s http://localhost:8080/api/locations/zones      # 21 areas, readable Vietnamese names
curl.exe -s "http://localhost:8080/api/products?size=1"    # catalog answers
```

The startup log must show no `APPLICATION FAILED` / schema-validation error; with `ORDER_EXPIRY_ENABLED=false` it logs
"Order expiry job is OFF". Smoke test with a test account (not a demo account): quote → checkout of one listing →
order shows `shipping.source = SIMULATED_QUOTE` → cancel it. Demo orders 1–12 must show `shipping.source = LEGACY`.

## 7. Rollback decision criteria

| Situation | Action |
|---|---|
| Migration exit ≠ 0 | nothing applied (single transaction): keep V002 + previous backend; investigate |
| Post-check section A differs, or any section B value unexpected, before the backend is started | `V003_rollback.sql` (step 8a) |
| Backend fails to start / health not UP and the cause is not configuration | stop the backend; step 8a if no V003-format data exists yet |
| Any V003-format data already written (a quote, a campusless user or listing, a BankQR payment) and a rollback is still required | step 8b (restore), the rollback script refuses by design |
| Problem limited to the frontend or configuration | fix forward; no database rollback |

## 8. Rollback procedures

**8a. Script (only while no V003-format data exists):**

```powershell
sqlcmd -S $Srv -E -C -I -b -f 65001 -d $Db -i "$Repo\database\migrations\V003_rollback.sql" `
  -v Approved="YES" TargetDb="UniMarketJava" ProductionApproval="YES" *> "$Out\rollback.log"
sqlcmd -S $Srv -E -C -I -W -s "|" -f 65001 -d $Db -i "$Repo\database\validation\V003_pre_post_checks.sql" -o "$Out\checks-after-rollback.txt"
Compare-Object (Get-Content "$Out\checks-pre.txt") (Get-Content "$Out\checks-after-rollback.txt")   # expected: no output
```

Rehearsed: apply → rollback gives a schema identical to the pre-V003 database (459/459 items). The provider CHECKs
return under explicit names with the same rule. Then redeploy the previous backend build.

**8b. Restore of the step-2 backup (any time; loses everything written after step 2):**

```powershell
sqlcmd -S $Srv -E -C -b -Q "ALTER DATABASE [$Db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  RESTORE DATABASE [$Db] FROM DISK = N'$Bak' WITH CHECKSUM, REPLACE;
  ALTER DATABASE [$Db] SET MULTI_USER;"
```

Then re-run 1.2 / 1.3 and compare with `checks-pre.txt`. This needs a separate explicit decision because it replaces
the real database.

## 9. Known, accepted facts (not blockers)

- Settlements of demo orders 1–4: `ShippingFee = 0`, `Amount = subtotal − commission` (V001 rule; V002 step 5b kept them
  unchanged by an approved decision; order 4 stays 92 150 VND). Not modified by V003. Admin release of order 4 pays the
  recorded 92 150.
- `dbo.usp_Checkout` (V002, unchanged) stays executable by `unimarket_app` through the schema-level grant; the backend no
  longer calls it. Optional hardening, rehearsed on a copy and **not part of this deployment unless approved**:
  `DENY EXECUTE ON dbo.usp_Checkout TO unimarket_app;` — direct calls then fail (229) while
  `usp_CheckoutWithShipping` keeps working through ownership chaining. Undo with `REVOKE EXECUTE ON dbo.usp_Checkout TO unimarket_app;`.
- In the `dev` profile verification codes are written to the backend log (mail mode `log`).

## 10. Execution record (2026-11-03)

| Item | Result |
|---|---|
| Approval | team approval for the local academic-MVP `UniMarketJava` |
| Script SHA-256 | `98585f470e7bd472c1d1ea27c57b627a2792a5ea1653d9f984ec61df62fd1d3c` (= `V003.sha256`) |
| Backup | `UniMarketJava_preV003_20261103-0922.bak`, FULL COPY_ONLY WITH CHECKSUM, 10 567 680 bytes; VERIFYONLY valid; restored as `UniMarketJava_PreV003Verify`, DBCC CHECKDB clean, data identical |
| Migration | 09:24:38–09:24:40 (+07:00), exit 0, "V003 applied and verified"; `SchemaMigrations` has V003 once (AppliedAt 02:24:40 UTC) |
| Post checks | section A identical; 113/113 history rows identical; 0 financial violations (4 V001 legacy settlements unchanged); schema (506 items), zone data and `usp_CheckoutWithShipping` identical to the tested copy |
| Backend | started with `ddl-auto=validate`; `/api/health` UP, database UP; zones, catalog, profiles and registration validation verified without writes |
| Evidence | `D:\Deploy\V003-20261103-0922\` (`EXECUTION_RECORD.md` and all check outputs) |
