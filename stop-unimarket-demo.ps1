<#
.SYNOPSIS
  Stops every running UniMarket backend (Spring Boot) and frontend (Vite) process - and nothing else.

.DESCRIPTION
  A process is treated as UniMarket only when its command line proves it:
    * java.exe running com.unimarket.UniMarketApplication / a unimarket-backend JAR, plus its Maven launcher parent
      (mvnw spring-boot:run);
    * node.exe running Vite from D:\...\UniMarket-Frontend, plus its npm / npx launcher parent.
  SQL Server, IDEs, language servers and other applications are never touched. Databases and logs are kept.

.EXAMPLE
  .\stop-unimarket-demo.ps1            # stop all UniMarket processes
  .\stop-unimarket-demo.ps1 -ListOnly  # only show them
#>
param([switch]$ListOnly)

function Get-UniMarketProcesses {
  $all = @(Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='node.exe'")
  $byId = @{}; foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
  $found = @{}
  foreach ($p in $all) {
    $cl = [string]$p.CommandLine
    $isBackend = $p.Name -eq 'java.exe' -and ($cl -match 'com\.unimarket\.UniMarketApplication' -or $cl -match 'unimarket-backend[^\\/]*\.jar' -or $cl -match '@[^ ]*spring-boot-[^ ]*argfile')
    $isFrontend = $p.Name -eq 'node.exe' -and $cl -match 'UniMarket-Frontend' -and $cl -match 'vite'
    if (-not ($isBackend -or $isFrontend)) { continue }
    # spring-boot:run argfiles do not name the class on the command line: confirm through the listening ports below.
    $found[[int]$p.ProcessId] = [pscustomobject]@{ Id = [int]$p.ProcessId; Kind = $(if ($isBackend) { 'backend' } else { 'frontend' }); Ports = ''; Cmd = $cl }
    $parent = $byId[[int]$p.ParentProcessId]
    if ($parent) {
      $pcl = [string]$parent.CommandLine
      if (($isBackend -and $pcl -match 'classworlds|maven') -or ($isFrontend -and $pcl -match 'npm-cli|npx-cli')) {
        $found[[int]$parent.ProcessId] = [pscustomobject]@{ Id = [int]$parent.ProcessId; Kind = "$(if ($isBackend) { 'backend' } else { 'frontend' }) launcher"; Ports = ''; Cmd = $pcl }
      }
    }
  }
  $listen = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
  foreach ($e in $found.Values) { $e.Ports = (($listen | Where-Object OwningProcess -eq $e.Id | Select-Object -ExpandProperty LocalPort -Unique) -join ',') }
  # A java argfile process counts only if it listens on a UniMarket-style port (8080-8099).
  $found.Values | Where-Object { -not ($_.Kind -eq 'backend' -and $_.Cmd -match 'argfile' -and $_.Cmd -notmatch 'unimarket' -and -not ($_.Ports -split ',' | Where-Object { [int]$_ -ge 8080 -and [int]$_ -le 8099 })) }
}

$procs = @(Get-UniMarketProcesses | Sort-Object Kind, Id)
if (-not $procs.Count) { Write-Host 'No UniMarket process is running.'; return }
$procs | ForEach-Object { Write-Host ("{0,-18} PID {1,-6} ports [{2}]" -f $_.Kind, $_.Id, $_.Ports) }
if ($ListOnly) { return }
foreach ($p in ($procs | Sort-Object { $_.Kind -like '*launcher' })) {   # servers first, then their launchers
  try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Write-Host "stopped PID $($p.Id) ($($p.Kind))" } catch { Write-Host "PID $($p.Id) already gone" }
}
Start-Sleep -Seconds 2
$left = @(Get-UniMarketProcesses)
if ($left.Count) { Write-Warning "Still running: $($left.Id -join ', ')" } else { Write-Host 'All UniMarket processes are stopped.' }
