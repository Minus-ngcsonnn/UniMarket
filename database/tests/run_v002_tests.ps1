<#
  Runs the whole V002 verification on disposable copies of the source database.
  The source database is only READ (copy-only backup); it is never modified.

  1. Copy source -> <Source>_V002Test, run pre-checks, migration, post-checks,
     scenario tests and the two-session concurrency test.
  2. Copy source -> <Source>_V002Fail, plant a conflicting object so the migration
     fails half-way, and prove it rolled back completely.
  3. Drop both copies unless -KeepCopies is given.

  .\run_v002_tests.ps1 -Server "localhost\MSSQLSERVER09" -Source "UniMarketJava" [-KeepCopies]
#>
param(
    [string]$Server = 'localhost\MSSQLSERVER09',
    [string]$Source = 'UniMarketJava',
    [switch]$KeepCopies
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backupDir = (sqlcmd -S $Server -E -C -h -1 -W -Q "SET NOCOUNT ON; SELECT SERVERPROPERTY('InstanceDefaultBackupPath')" | Out-String).Trim()
$testDb = "${Source}_V002Test"; $failDb = "${Source}_V002Fail"
$failures = 0

function Step([string]$title) { "`n===== $title" }
function Run-File([string]$db, [string]$file, [switch]$AllowFail) {
    $out = sqlcmd -S $Server -E -C -I -b -d $db -W -s '|' -i $file 2>&1 | Out-String -Width 400
    $code = $LASTEXITCODE
    Write-Host $out.TrimEnd()
    if ($code -ne 0 -and -not $AllowFail) { $script:failures++; Write-Host "!! exit code $code" }
    return $code
}
function New-Copy([string]$name) {
    $bak = Join-Path $backupDir "${Source}_copyonly_for_${name}.bak"
    sqlcmd -S $Server -E -C -b -i (Join-Path $PSScriptRoot 'create_test_copy.sql') -v SourceDb=$Source TestDb=$name "BackupFile=`"$bak`"" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create $name" }
    "created $name"
}
function Fingerprint([string]$db) {
    sqlcmd -S $Server -E -C -d $db -h -1 -W -s '|' -i (Join-Path $PSScriptRoot 'fingerprint.sql') | Out-String
}
function Drop-Copy([string]$name) {
    if ($name -notlike '*_V002*') { throw "Refusing to drop $name" }
    sqlcmd -S $Server -E -C -b -Q "IF DB_ID(N'$name') IS NOT NULL BEGIN ALTER DATABASE [$name] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$name]; END" | Out-Null
}

foreach ($db in $testDb, $failDb) { Drop-Copy $db }
$sourceBefore = Fingerprint $Source

Step "1. Test copy $testDb"
New-Copy $testDb
Step 'pre-migration checks'; Run-File $testDb (Join-Path $root 'validation\V002_pre_migration_checks.sql') | Out-Null
Step 'migration V002';        Run-File $testDb (Join-Path $root 'migrations\V002__multi_item_orders.sql') | Out-Null
Step 'post-migration checks'; Run-File $testDb (Join-Path $root 'validation\V002_post_migration_checks.sql') | Out-Null
Step 'migration again (must refuse)'
if ((Run-File $testDb (Join-Path $root 'migrations\V002__multi_item_orders.sql') -AllowFail) -eq 0) { $failures++; '!! a second run was not refused' }
Step 'scenario tests';        Run-File $testDb (Join-Path $PSScriptRoot 'V002_order_scenarios_test.sql') | Out-Null
Step 'business rules D1-D6';  Run-File $testDb (Join-Path $PSScriptRoot 'V002_business_rules_D1_D6_test.sql') | Out-Null
Step 'seller confirmation window (Business Plan 3.4)'; Run-File $testDb (Join-Path $PSScriptRoot 'V002_seller_confirmation_test.sql') | Out-Null
Step 'concurrency test'
& (Join-Path $PSScriptRoot 'V002_concurrency_test.ps1') -Server $Server -Database $testDb
if ($LASTEXITCODE -ne 0) { $failures++ }

Step "2. Failure / rollback test on $failDb"
New-Copy $failDb
# Plant an object with the name the migration creates in step 6, so it fails half-way.
sqlcmd -S $Server -E -C -I -b -d $failDb -Q "EXEC('CREATE VIEW dbo.vw_ActiveOrderItems AS SELECT 1 AS x')" | Out-Null
$failBefore = Fingerprint $failDb
$code = Run-File $failDb (Join-Path $root 'migrations\V002__multi_item_orders.sql') -AllowFail
$failAfter = Fingerprint $failDb
$stillV001 = (sqlcmd -S $Server -E -C -d $failDb -h -1 -W -Q "SET NOCOUNT ON; SELECT IIF(COL_LENGTH('dbo.Orders','ProductId') IS NOT NULL AND OBJECT_ID('dbo.OrderItems') IS NULL AND OBJECT_ID('dbo.SchemaMigrations') IS NULL, 1, 0)" | Out-String).Trim()
"migration exit code: $code (expected non-zero)"
"schema still V001: $stillV001; fingerprint unchanged: $($failBefore -eq $failAfter)"
if ($code -eq 0 -or $stillV001 -ne '1' -or $failBefore -ne $failAfter) { $failures++; '!! half-way failure was not rolled back cleanly' } else { 'PASS  half-way failure rolled back completely' }

Step "3. Source database $Source untouched"
$sourceAfter = Fingerprint $Source
if ($sourceBefore -eq $sourceAfter) { 'PASS  source fingerprint identical' } else { $failures++; '!! source database changed' }

if (-not $KeepCopies) { Drop-Copy $failDb; Drop-Copy $testDb; "`ncopies dropped" } else { "`ncopies kept: $testDb, $failDb" }
"`nTOTAL: $(if ($failures) { "$failures FAILURE(S)" } else { 'all V002 checks passed' })"
if ($failures) { exit 1 }
