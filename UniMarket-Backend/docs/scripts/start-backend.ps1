<#
.SYNOPSIS
  Starts the UniMarket backend against an EXPLICIT database (never the implicit default).

.DESCRIPTION
  application.properties falls back to the main database (UniMarketJava) when DB_URL is not set. This script always
  sets DB_URL itself and refuses UniMarketJava unless -OfficialDemo is given (official demo mode, explicit approval).
  Secrets (DB_USERNAME / DB_PASSWORD, JWT_SECRET, mail credentials) stay in UniMarket-Backend/.env (git-ignored) and are
  never passed on the command line or printed.

.EXAMPLE
  # Stage 7 test / rehearsal mode (clone), frontend on 5175:
  .\start-backend.ps1 -Database UniMarketJava_Stage7ReadyTest -Port 8083 -FrontendPort 5175

.EXAMPLE
  # Official demo mode (main database) - only after explicit approval; no write-based tests in this mode:
  .\start-backend.ps1 -Database UniMarketJava -Port 8080 -FrontendPort 5173 -OfficialDemo
#>
param(
  [Parameter(Mandatory = $true)][string]$Database,
  [int]$Port = 8080,
  [int]$FrontendPort = 5173,
  [string]$SqlHost = 'localhost',
  [int]$SqlPort = 1433,
  [string]$SqlServer = 'localhost\MSSQLSERVER09',
  # Default: 'smtp' (real Gmail) in -OfficialDemo mode, 'log' (codes in the console) for clones / automated tests.
  [ValidateSet('', 'log', 'smtp')][string]$MailMode = '',
  [string]$UploadDir = '',
  [switch]$OfficialDemo
)
$ErrorActionPreference = 'Stop'

if ($Database -notmatch '^[A-Za-z0-9_]+$') { throw "Invalid database name: $Database" }
if ($Database -eq 'UniMarketJava' -and -not $OfficialDemo) {
  throw 'Refusing to start against the MAIN database UniMarketJava. Use a clone, or pass -OfficialDemo after explicit approval.'
}
if ($Database -ne 'UniMarketJava' -and $OfficialDemo) { throw '-OfficialDemo is only meant for UniMarketJava.' }

if (-not $MailMode) { $MailMode = if ($OfficialDemo) { 'smtp' } else { 'log' } }
if ($OfficialDemo -and $MailMode -ne 'smtp') { Write-Warning 'Official demo with MAIL_MODE=log: OTP e-mails are NOT sent, codes only appear in the backend console.' }

$backendDir = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not (Test-Path (Join-Path $backendDir 'mvnw.cmd'))) { throw "mvnw.cmd not found in $backendDir" }
$envFile = Join-Path $backendDir '.env'
if (-not (Test-Path $envFile)) { Write-Warning 'UniMarket-Backend\.env not found: DB credentials and secrets must come from the environment.' }

# Required configuration, checked for presence only (values are never printed). OS environment wins over .env.
$dotenv = @{}
if (Test-Path $envFile) { foreach ($line in Get-Content $envFile -Encoding UTF8) { if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $dotenv[$matches[1]] = $matches[2].Trim() } } }
function Test-Setting([string]$name) { [bool]([Environment]::GetEnvironmentVariable($name) -or $dotenv[$name]) }
$required = @('DB_USERNAME', 'DB_PASSWORD')
if ($MailMode -eq 'smtp') { $required += @('MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_FROM') }
$missing = @($required | Where-Object { -not (Test-Setting $_) })
if ($missing.Count) { throw "Missing configuration in UniMarket-Backend\.env or the environment: $($missing -join ', ') (values are not shown)." }

# One backend per port, and only one backend on the main database.
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use. Stop that process first (stop-unimarket-demo.ps1) - no second backend is started." }
$users = sqlcmd -S $SqlServer -E -C -h -1 -W -d master -Q "SET NOCOUNT ON; SELECT DISTINCT host_process_id FROM sys.dm_exec_sessions WHERE database_id = DB_ID(N'$Database') AND program_name LIKE 'Microsoft JDBC%'" 2>$null | Where-Object { $_ -match '^\d+$' }
if ($users) { throw "Another Java/JDBC process (PID $($users -join ', ')) is already connected to $Database. Stop it first - no duplicate backend is started." }

# The database must exist and be ONLINE before the backend validates the schema against it.
$state = sqlcmd -S $SqlServer -E -C -h -1 -W -d master -Q "SET NOCOUNT ON; SELECT state_desc FROM sys.databases WHERE name = N'$Database'" 2>$null
if (($state | Out-String).Trim() -ne 'ONLINE') { throw "Database $Database is not ONLINE (sqlcmd answer: '$(($state | Out-String).Trim())')." }

if (-not $env:JAVA_HOME) {
  $jdk = Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($jdk) { $env:JAVA_HOME = $jdk.FullName } else { throw 'JAVA_HOME is not set and no JDK 21 was found in %USERPROFILE%\.jdks.' }
}

$env:DB_URL = "jdbc:sqlserver://${SqlHost}:$SqlPort;databaseName=$Database;encrypt=true;trustServerCertificate=true"
$env:SERVER_PORT = "$Port"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:$FrontendPort"
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:MAIL_MODE = $MailMode
$env:ORDER_EXPIRY_ENABLED = 'false'
$env:PAYMENT_SIMULATOR_ENABLED = 'true'
if (-not $UploadDir) { $UploadDir = Join-Path $backendDir "uploads\$Database" }
New-Item -ItemType Directory -Force $UploadDir | Out-Null
$env:UPLOAD_DIR = $UploadDir

Write-Host "UniMarket backend -> database [$Database] on ${SqlHost}:${SqlPort} | http://localhost:$Port | CORS http://localhost:$FrontendPort | mail=$MailMode | expiry OFF | payments SIMULATED | uploads $UploadDir"
if ($OfficialDemo) { Write-Warning 'OFFICIAL DEMO MODE: every action changes the main database UniMarketJava.' }
Set-Location $backendDir

# Run an immutable copy of the application, NOT `mvnw spring-boot:run`: spring-boot:run loads classes lazily from
# target/classes, and any later build or test run (mvnw test / package / compile) rewrites that folder while the server
# is running. A class that is first needed at that moment (e.g. AttemptLimiter$Counter, used only on a failed sign-in)
# then fails to load, the JVM remembers the failure, and every wrong-password sign-in answers HTTP 500 until restart.
& .\mvnw.cmd -q -DskipTests package
if ($LASTEXITCODE -ne 0) { throw 'Build failed (mvnw package).' }
$jar = Get-ChildItem (Join-Path $backendDir 'target') -Filter 'unimarket-backend-*.jar' | Where-Object { $_.Name -notlike '*.original' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $jar) { throw 'No unimarket-backend-*.jar found in target/.' }
$runDir = Join-Path $env:LOCALAPPDATA 'UniMarket\run'
New-Item -ItemType Directory -Force $runDir | Out-Null
# Old copies are removed only when no process holds them open (a running JAR is locked by Windows and kept).
Get-ChildItem $runDir -Filter "unimarket-backend-$Port*.jar" -ErrorAction SilentlyContinue | ForEach-Object { try { Remove-Item $_.FullName -Force -ErrorAction Stop } catch { } }
# A new, unique file per start: a running JAR is never overwritten by a later start or build.
$runJar = Join-Path $runDir ("unimarket-backend-$Port-{0}.jar" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item $jar.FullName $runJar
Write-Host "Running $runJar (copy of $($jar.Name), built $($jar.LastWriteTime)); later builds do not affect this process."
# Working directory stays UniMarket-Backend so spring.config.import=optional:file:.env still finds the git-ignored .env.
& (Join-Path $env:JAVA_HOME 'bin\java.exe') -jar $runJar
