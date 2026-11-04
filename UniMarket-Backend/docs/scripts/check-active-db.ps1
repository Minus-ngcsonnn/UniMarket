<#
.SYNOPSIS
  Shows which database the backend listening on a port is ACTUALLY connected to (read-only check).

.DESCRIPTION
  Finds the process listening on -Port, then asks SQL Server (Windows authentication, read-only DMV query) which
  databases that process has open sessions on. Use it before any test that writes data.

.EXAMPLE
  .\check-active-db.ps1 -Port 8083
  .\check-active-db.ps1 -Port 8083 -Expect UniMarketJava_Stage7ReadyTest   # exit code 1 if it is anything else
#>
param(
  [Parameter(Mandatory = $true)][int]$Port,
  [string]$Expect = '',
  [string]$SqlServer = 'localhost\MSSQLSERVER09'
)
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { Write-Host "Nothing listens on port $Port."; exit 1 }
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)"
$dbs = @(sqlcmd -S $SqlServer -E -C -h -1 -W -d master -Q "SET NOCOUNT ON; SELECT DISTINCT DB_NAME(database_id) FROM sys.dm_exec_sessions WHERE host_process_id = $($proc.ProcessId) AND program_name LIKE 'Microsoft JDBC%'" | Where-Object { $_ })
Write-Host ("Port {0} -> PID {1} ({2}) -> database(s): {3}" -f $Port, $proc.ProcessId, $proc.Name, ($(if ($dbs.Count) { $dbs -join ', ' } else { 'none (not started yet?)' })))
if ($dbs -contains 'UniMarketJava') { Write-Warning 'This backend is connected to the MAIN database UniMarketJava.' }
if ($Expect -and ($dbs.Count -ne 1 -or $dbs[0] -ne $Expect)) { Write-Host "Expected only $Expect - do NOT run write-based tests."; exit 1 }
