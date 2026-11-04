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
  [ValidateSet('log', 'smtp')][string]$MailMode = 'log',
  [string]$UploadDir = '',
  [switch]$OfficialDemo
)
$ErrorActionPreference = 'Stop'

if ($Database -notmatch '^[A-Za-z0-9_]+$') { throw "Invalid database name: $Database" }
if ($Database -eq 'UniMarketJava' -and -not $OfficialDemo) {
  throw 'Refusing to start against the MAIN database UniMarketJava. Use a clone, or pass -OfficialDemo after explicit approval.'
}
if ($Database -ne 'UniMarketJava' -and $OfficialDemo) { throw '-OfficialDemo is only meant for UniMarketJava.' }

$backendDir = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not (Test-Path (Join-Path $backendDir 'mvnw.cmd'))) { throw "mvnw.cmd not found in $backendDir" }
if (-not (Test-Path (Join-Path $backendDir '.env'))) { Write-Warning 'UniMarket-Backend\.env not found: DB credentials and JWT_SECRET must come from the environment.' }

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
& .\mvnw.cmd spring-boot:run
