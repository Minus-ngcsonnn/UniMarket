<#
.SYNOPSIS
  Login smoke test against a RUNNING backend (or a frontend proxy): failed sign-ins must be controlled 401s, never 500.

.DESCRIPTION
  Sends only deliberately wrong credentials (no real password is needed or printed):
    * existing account + wrong password  -> 401 INVALID_CREDENTIALS
    * unknown e-mail + any password      -> 401 INVALID_CREDENTIALS (same answer, no account enumeration)
    * missing password                   -> 400 VALIDATION_FAILED
  Regression guard for the "wrong password -> HTTP 500" incident (a backend whose classes were rewritten while it ran).
  Note: each wrong attempt counts towards the account's sign-in attempt limit, exactly like a user typing it.

.EXAMPLE
  .\smoke-login.ps1 -BaseUrl http://localhost:5173 -Email demo.admin@fpt.edu.vn
#>
param(
  [string]$BaseUrl = 'http://localhost:5173',
  [string]$Email = 'demo.admin@fpt.edu.vn'
)
$origin = ([Uri]$BaseUrl).GetLeftPart([UriPartial]::Authority)
function Post($body) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/auth/login" -ContentType 'application/json' -Headers @{ Origin = $origin } -Body ($body | ConvertTo-Json)
    return @{ status = [int]$r.StatusCode; code = '' }
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { return @{ status = 0; code = $_.Exception.Message } }
    $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
    $code = try { ($text | ConvertFrom-Json).code } catch { '' }
    return @{ status = [int]$resp.StatusCode; code = $code }
  }
}
$cases = @(
  @{ name = 'wrong password';   body = @{ email = $Email; password = 'Wrong-Pass-123' };                 status = 401; code = 'INVALID_CREDENTIALS' },
  @{ name = 'unknown e-mail';   body = @{ email = "nobody.$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"; password = 'Wrong-Pass-123' }; status = 401; code = 'INVALID_CREDENTIALS' },
  @{ name = 'missing password'; body = @{ email = $Email };                                               status = 400; code = 'VALIDATION_FAILED' }
)
$failed = 0
foreach ($c in $cases) {
  $r = Post $c.body
  $ok = $r.status -eq $c.status -and $r.code -eq $c.code
  if (-not $ok) { $failed++ }
  Write-Host ("{0} {1,-16} -> {2} {3} (expected {4} {5})" -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $c.name, $r.status, $r.code, $c.status, $c.code)
}
if ($failed) { Write-Host "$failed check(s) failed. A 500 here usually means a stale/broken backend process: restart it with start-backend.ps1."; exit 1 }
