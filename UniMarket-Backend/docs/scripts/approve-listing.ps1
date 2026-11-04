# Approves (or rejects) a pending listing through the Stage 5 Admin API — the same business rules and audit row
# (dbo.AdminActions) as the future admin UI. For manual testing on the ISOLATED backend only.
#
#   powershell -ExecutionPolicy Bypass -File UniMarket-Backend\docs\scripts\approve-listing.ps1 -ProductId 123
#   powershell -ExecutionPolicy Bypass -File UniMarket-Backend\docs\scripts\approve-listing.ps1 -ProductId 123 -Reject -Reason "Photos do not show the item."
#
# - Calls the frontend dev proxy (http://localhost:5173/api -> backend 8081 -> UniMarketJava_V003Test) by default.
# - Signs in as an ADMIN account (default: the demo admin of the test copy). The password is typed hidden and never
#   stored or printed. Never point -Api at a backend that uses the real UniMarketJava database.
param(
    [Parameter(Mandatory = $true)][int]$ProductId,
    [string]$Api = 'http://localhost:5173/api',
    [string]$AdminEmail = 'demo.admin@fpt.edu.vn',
    [switch]$Reject,
    [string]$Reason = '',
    [string]$Note = ''
)
$ErrorActionPreference = 'Stop'

$health = Invoke-RestMethod -Uri "$Api/health" -Method Get
Write-Host "Backend: $($health.status) at $Api (the health check does not name the database: make sure this backend was started with DB_URL=...UniMarketJava_V003Test)"

$secure = Read-Host -AsSecureString "Password for $AdminEmail"
$password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$login = Invoke-RestMethod -Uri "$Api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = $AdminEmail; password = $password } | ConvertTo-Json)
$password = $null
if ($login.user.role -ne 'ADMIN') { Write-Host 'This account is not an admin.'; exit 1 }
$headers = @{ Authorization = "Bearer $($login.accessToken)" }

# The reviewed version: approve / reject apply only to it (409 LISTING_CHANGED if the seller edited it meanwhile).
$listing = Invoke-RestMethod -Uri "$Api/admin/listings/$ProductId" -Headers $headers -Method Get
Write-Host "Listing $ProductId: '$($listing.title)' | moderation $($listing.moderation) | status $($listing.status)"

if ($Reject) {
    if ($Reason.Length -lt 10) { Write-Host 'A rejection needs -Reason with 10-1000 characters (shown to the seller).'; exit 1 }
    $body = @{ version = $listing.version; reason = $Reason } | ConvertTo-Json
    $result = Invoke-RestMethod -Uri "$Api/admin/listings/$ProductId/reject" -Headers $headers -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
} else {
    $payload = @{ version = $listing.version }
    if ($Note) { $payload.note = $Note }
    $body = $payload | ConvertTo-Json
    $result = Invoke-RestMethod -Uri "$Api/admin/listings/$ProductId/approve" -Headers $headers -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
}
Write-Host "Done: moderation is now $($result.moderation)."
