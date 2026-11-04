<#
.SYNOPSIS
  One-command start of the OFFICIAL UniMarket demo:  http://localhost:5173  ->  backend 8080  ->  UniMarketJava.

.DESCRIPTION
  1. Checks SQL Server, the main database (ONLINE, migrations V001-V003) and that a verified backup of it exists
     (creates a new COPY_ONLY backup with a unique name when none is younger than -BackupMaxAgeHours).
  2. Checks the required configuration in UniMarket-Backend\.env (presence only, values are never printed).
  3. Stops every other UniMarket backend / frontend (stop-unimarket-demo.ps1) - nothing else is touched.
  4. Starts the backend from an immutable JAR copy (docs\scripts\start-backend.ps1 -OfficialDemo: real Gmail SMTP,
     simulated payments and delivery, ddl-auto=validate, order expiry OFF) and waits until it answers.
  5. Starts Vite on 5173 with VITE_BACKEND_URL=http://localhost:8080 and VITE_AUTH_MODE=backend (real APIs, no mocks).
  6. Verifies the database the backend is really connected to, the frontend proxy, and the sign-in smoke test.
  Logs: %LOCALAPPDATA%\UniMarket\logs\backend-8080.log and frontend-5173.log (OTP codes are e-mailed, not logged).

.EXAMPLE
  cd D:\Minus\UniMarket
  powershell -ExecutionPolicy Bypass -File .\start-unimarket-demo.ps1
#>
param(
  [string]$SqlServer = 'localhost\MSSQLSERVER09',
  [int]$BackendPort = 8080,
  [int]$FrontendPort = 5173,
  [int]$BackupMaxAgeHours = 24,
  [int]$TimeoutSeconds = 240
)
$ErrorActionPreference = 'Stop'
$Database = 'UniMarketJava'
$root = $PSScriptRoot
$scripts = Join-Path $root 'UniMarket-Backend\docs\scripts'
$logDir = Join-Path $env:LOCALAPPDATA 'UniMarket\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Sql($q) { $out = sqlcmd -S $SqlServer -E -C -b -h -1 -W -s '|' -d master -Q "SET NOCOUNT ON; $q"; if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed: $q" }; $out }

Step '1/6 SQL Server and the main database'
$svc = Get-Service | Where-Object { $_.Name -like 'MSSQL$*' -and $_.Status -eq 'Running' }
if (-not $svc) { throw 'No SQL Server instance is running. Start the service "SQL Server (MSSQLSERVER09)" first.' }
$state = (Sql "SELECT state_desc FROM sys.databases WHERE name = N'$Database'") | Select-Object -First 1
if ($state -ne 'ONLINE') { throw "Database $Database is not ONLINE ('$state')." }
$mig = (sqlcmd -S $SqlServer -E -C -b -h -1 -W -d $Database -Q 'SET NOCOUNT ON; SELECT STRING_AGG(Version, '','') WITHIN GROUP (ORDER BY Version) FROM dbo.SchemaMigrations') | Select-Object -First 1
if ($mig -ne 'V001,V002,V003') { throw "Unexpected migration history in $Database ('$mig'); the backend expects V001,V002,V003." }
Write-Host "SQL Server $((Sql 'SELECT @@SERVERNAME') | Select-Object -First 1): $Database ONLINE, migrations $mig"
$lastBackup = (Sql "SELECT ISNULL(DATEDIFF(MINUTE, MAX(backup_finish_date), GETDATE()), 999999) FROM msdb.dbo.backupset WHERE database_name = N'$Database' AND type = 'D'") | Select-Object -First 1
if ([int]$lastBackup -gt $BackupMaxAgeHours * 60) {
  $dir = (Sql "SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(400))") | Select-Object -First 1
  $bak = Join-Path $dir ("{0}_copyonly_demo_{1}.bak" -f $Database, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Sql "DECLARE @r int; EXEC master.dbo.xp_fileexist N'$bak', @r OUTPUT; IF @r = 1 THROW 50002, 'backup file exists', 1; BACKUP DATABASE [$Database] TO DISK = N'$bak' WITH COPY_ONLY, CHECKSUM, NOINIT; RESTORE VERIFYONLY FROM DISK = N'$bak' WITH CHECKSUM;" | Out-Null
  Write-Host "New verified COPY_ONLY backup: $bak"
} else { Write-Host "Latest backup of $Database is $lastBackup minute(s) old - no new backup needed." }

Step '2/6 Configuration (UniMarket-Backend\.env, values not shown)'
$envFile = Join-Path $root 'UniMarket-Backend\.env'
if (-not (Test-Path $envFile)) { throw 'UniMarket-Backend\.env is missing.' }
$dotenv = @{}; foreach ($line in Get-Content $envFile -Encoding UTF8) { if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $dotenv[$matches[1]] = $matches[2].Trim() } }
$missing = @('DB_USERNAME', 'DB_PASSWORD', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_FROM') | Where-Object { -not $dotenv[$_] }
if ($missing) { throw "Missing in UniMarket-Backend\.env: $($missing -join ', ')" }
Write-Host "DB login, Gmail SMTP sender and App Password are configured. SMTP host $(if ($dotenv['MAIL_HOST']) { $dotenv['MAIL_HOST'] } else { 'smtp.gmail.com' }):$(if ($dotenv['MAIL_PORT']) { $dotenv['MAIL_PORT'] } else { 587 })"
if (-not $dotenv['JWT_SECRET']) { Write-Host 'JWT_SECRET is not set: the dev profile uses a random key per start (everyone signs in again after a restart).' }

Step '3/6 Stopping other UniMarket processes'
& (Join-Path $root 'stop-unimarket-demo.ps1')
foreach ($p in $BackendPort, $FrontendPort) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { throw "Port $p is used by a non-UniMarket process (PID $($c.OwningProcess)). Free it and start again." }
}

Step "4/6 Backend $BackendPort -> $Database (official demo mode)"
$backendLog = Join-Path $logDir "backend-$BackendPort.log"
# Servers are created through WMI (Win32_Process.Create) so they do NOT belong to this console's process tree: closing
# this window (or the tool that ran this script) does not stop them. Stop them with stop-unimarket-demo.ps1.
function Start-Detached([string]$commandLine, [string]$workDir) {
  # CREATE_NO_WINDOW (0x08000000) | CREATE_NEW_PROCESS_GROUP (0x200): a hidden console of their own and their own
  # process group - a Ctrl+C or a closed terminal elsewhere does not reach the servers.
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ CreateFlags = [uint32](0x08000000 -bor 0x200); ShowWindow = [uint16]0 }
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine; CurrentDirectory = $workDir; ProcessStartupInformation = $startup }
  if ($r.ReturnValue -ne 0) { throw "Could not start: $commandLine (Win32_Process.Create = $($r.ReturnValue))" }
}
$javaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { (Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $javaHome) { throw 'JDK 21 not found (set JAVA_HOME).' }
$toolPath = (@((Split-Path (Get-Command sqlcmd).Source), (Split-Path (Get-Command node).Source)) | Select-Object -Unique) -join ';'
Remove-Item $backendLog, "$backendLog.err" -ErrorAction SilentlyContinue
Start-Detached ("cmd.exe /c set ""JAVA_HOME=$javaHome"" && set ""PATH=$toolPath;%PATH%"" && powershell -NoProfile -ExecutionPolicy Bypass -File ""$(Join-Path $scripts 'start-backend.ps1')"" -Database $Database -Port $BackendPort -FrontendPort $FrontendPort -MailMode smtp -OfficialDemo > ""$backendLog"" 2>&1") (Join-Path $root 'UniMarket-Backend')
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ($true) {
  Start-Sleep -Seconds 3
  try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:$BackendPort/api/categories" -TimeoutSec 5).StatusCode -eq 200) { break } } catch { }
  $tail = Get-Content $backendLog -Tail 40 -ErrorAction SilentlyContinue
  if ($tail -match 'APPLICATION FAILED TO START|Build failed|Refusing to start|Missing configuration|already in use|already connected|is not ONLINE') { $tail | Select-Object -Last 25; throw "Backend start failed - see $backendLog" }
  if ((Get-Date) -gt $deadline) { throw "Backend did not answer within $TimeoutSeconds s - see $backendLog" }
}
Start-Sleep -Seconds 4   # the SMTP login check runs right after startup
$mailLine = Select-String -Path $backendLog -Pattern 'SMTP check' | Select-Object -Last 1
Write-Host "Backend is up. $(if ($mailLine) { $mailLine.Line -replace '^.*SmtpEmailSender\s*:\s*', '' } else { 'SMTP check result not logged yet - see ' + $backendLog })"
if ($mailLine -and $mailLine.Line -notmatch 'succeeded') { Write-Warning 'Gmail SMTP login FAILED: OTP e-mails will not be delivered. Check MAIL_USERNAME / MAIL_PASSWORD (Google App Password) in .env.' }

Step "5/6 Frontend $FrontendPort -> http://localhost:$BackendPort (real APIs)"
$frontendLog = Join-Path $logDir "frontend-$FrontendPort.log"
Remove-Item $frontendLog, "$frontendLog.err" -ErrorAction SilentlyContinue
Start-Detached ("cmd.exe /c set ""VITE_BACKEND_URL=http://localhost:$BackendPort"" && set ""VITE_AUTH_MODE=backend"" && set ""PATH=$toolPath;%PATH%"" && npx vite --port $FrontendPort --strictPort > ""$frontendLog"" 2>&1") (Join-Path $root 'UniMarket-Frontend')
$deadline = (Get-Date).AddSeconds(90)
while ($true) {
  Start-Sleep -Seconds 2
  try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:$FrontendPort/" -TimeoutSec 5).StatusCode -eq 200) { break } } catch { }
  if ((Get-Date) -gt $deadline) { Get-Content $frontendLog -Tail 20 -ErrorAction SilentlyContinue; throw "Frontend did not start - see $frontendLog" }
}
if ((Get-Content $frontendLog -Raw -ErrorAction SilentlyContinue) -notmatch "/api -> http://localhost:$BackendPort \| auth mode: backend \| products: backend \| orders: backend \| admin & community: backend") {
  Get-Content $frontendLog -Tail 10; throw 'Vite does not report backend mode for products / orders / admin.'
}
Write-Host "Vite: /api -> http://localhost:$BackendPort, real backend for auth, products, orders and admin."

Step '6/6 Verification'
& (Join-Path $scripts 'check-active-db.ps1') -Port $BackendPort -Expect $Database -SqlServer $SqlServer
if ($LASTEXITCODE -ne 0) { throw "Backend $BackendPort is not connected only to $Database." }
$apiTotal = (Invoke-RestMethod "http://localhost:$FrontendPort/api/products?size=1").totalItems
$dbTotal = (sqlcmd -S $SqlServer -E -C -h -1 -W -d $Database -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.Products WHERE Status = 'Available' AND ModerationStatus = 'Approved'") | Select-Object -First 1
if ([int]$apiTotal -ne [int]$dbTotal) { throw "Frontend proxy returned $apiTotal public listings, $Database has $dbTotal - wrong backend?" }
Write-Host "Frontend proxy -> backend -> ${Database}: $apiTotal public listings (= database)"
& (Join-Path $scripts 'smoke-login.ps1') -BaseUrl "http://localhost:$FrontendPort"
if ($LASTEXITCODE) { throw 'Sign-in smoke test failed.' }

Write-Host "`nUniMarket is ready:  http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "Backend PID $((Get-NetTCPConnection -LocalPort $BackendPort -State Listen | Select-Object -First 1).OwningProcess) on http://localhost:$BackendPort  |  database $Database  |  real Gmail SMTP  |  payments & delivery simulated"
Write-Host "Logs: $logDir   Stop: .\stop-unimarket-demo.ps1"
