<#
  V002 concurrency tests - two real sessions at the same time. Run ONLY on a disposable *Test database.

  1. Two buyers check out the same listing.
       A holds its checkout open 4 s; B starts 1 s later.
       Expected: B waits, then fails with 51021; exactly one active order holds the listing.
  2. A successful payment result is recorded while the expiry job runs (D2).
       Order is past its payment deadline but its attempt started in time.
       A records the success and holds 4 s; B runs usp_ExpirePendingOrders 1 s later.
       Expected: B waits, the order ends Paid (not cancelled), items stay Reserved.
  4. The expiry job closes an unanswered attempt (beyond the 30-minute grace window) while
     the provider's success callback arrives (D2, approved late-callback rule).
       A expires the order and holds 4 s; B records the success 1 s later.
       Expected: B waits, then fails with 51026 (refund manually); order Cancelled, attempt Expired.
  5. Seller confirms just BEFORE the 24-hour seller window ends while the expiry job runs just AFTER it
     (Business Plan 3.4). A confirms and holds 8 s; B runs the expiry job 6 s later, after ConfirmBy.
       Expected: B waits, the order stays AwaitingPayment (confirmed in time), items Reserved.
  6. The expiry job cancels an order whose seller window has ended while the seller tries to confirm late.
       A expires and holds 4 s; B confirms 1 s later.
       Expected: B waits, then fails with 51007; order Cancelled, items Available.
  3. The expiry job runs while the buyer tries to start a payment (D2).
       A expires the overdue order and holds 4 s; B calls usp_StartPayment 1 s later.
       Expected: B waits, then fails with 51008; order Cancelled, items Available, no payment row.

  .\V002_concurrency_test.ps1 -Server "localhost\MSSQLSERVER09" -Database "UniMarketJava_V002Test"
#>
param(
    [string]$Server = 'localhost\MSSQLSERVER09',
    [Parameter(Mandatory)] [string]$Database
)
$ErrorActionPreference = 'Stop'
if ($Database -eq 'UniMarketJava' -or $Database -notlike '*Test*') { throw 'Refusing to run outside a *Test database.' }

function Invoke-Sql([string]$query) {
    $out = sqlcmd -S $Server -E -C -I -d $Database -h -1 -W -b -Q "SET NOCOUNT ON; $query" 2>&1
    return ($out | Out-String).Trim()
}
# Runs $sqlA (which holds its transaction for a while) and, 1 s later, $sqlB; returns both RESULT lines.
function Invoke-Race([string]$sqlA, [string]$sqlB, [int]$delayB = 1) {
    $job = Start-Job -ScriptBlock { param($s, $d, $q) sqlcmd -S $s -E -C -I -d $d -Q $q 2>&1 | Out-String } -ArgumentList $Server, $Database, $sqlA
    Start-Sleep -Seconds $delayB
    $b = sqlcmd -S $Server -E -C -I -d $Database -Q $sqlB 2>&1 | Out-String
    $a = Receive-Job $job -Wait -AutoRemoveJob
    $rx = [regex]'RESULT=[^\r\n]+'
    return @($rx.Match($a).Value, $rx.Match($b).Value)
}
function Waited([string]$line) { [int](([regex]'waited_ms=(\d+)').Match($line).Groups[1].Value) }
# Wraps a statement so it reports RESULT=OK / RESULT=ERR<number> and how long it took.
function Session([string]$body, [string]$hold = '00:00:00') {
@"
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @t0 datetime2 = SYSUTCDATETIME();
BEGIN TRY
  BEGIN TRAN;
  $body
  WAITFOR DELAY '$hold';
  COMMIT;
  PRINT CONCAT('RESULT=OK;waited_ms=', DATEDIFF(ms, @t0, SYSUTCDATETIME()));
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  PRINT CONCAT('RESULT=ERR', ERROR_NUMBER(), ';waited_ms=', DATEDIFF(ms, @t0, SYSUTCDATETIME()));
END CATCH
"@
}

# Available listings (newest first) and verified students who do not own them.
$listings = Invoke-Sql @"
SELECT STRING_AGG(CONCAT(p.ProductId, ':', p.SellerId), ',') WITHIN GROUP (ORDER BY p.ProductId DESC)
FROM dbo.Products p JOIN dbo.Users u ON u.UserId = p.SellerId JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
WHERE p.Status='Available' AND p.ModerationStatus='Approved' AND u.Status='Active' AND u.EmailVerifiedAt IS NOT NULL AND c.IsActive=1
"@
$pool = $listings.Split(',') | Select-Object -First 6 | ForEach-Object { $p, $s = $_.Split(':'); [pscustomobject]@{ Product = [int]$p; Seller = [int]$s } }
function Buyers([int]$seller) {
    (Invoke-Sql "SELECT CONCAT(MIN(UserId), ',', MAX(UserId)) FROM dbo.Users WHERE Role='Student' AND Status='Active' AND EmailVerifiedAt IS NOT NULL AND UserId <> $seller").Split(',') | ForEach-Object { [int]$_ }
}
function Checkout([int]$buyer, [int]$product) {
    "DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES ($product); EXEC dbo.usp_Checkout @BuyerId=$buyer, @ProductIds=@ids, @RecipientName=N'Concurrency', @RecipientPhone='0900000000', @DeliveryAddress=N'Dorm';"
}
$checks = [ordered]@{}

# ---------- 1. same listing, two buyers ----------
$l = $pool[0]; $bA, $bB = Buyers $l.Seller
"1. Listing $($l.Product) (seller $($l.Seller)); buyer A = $bA, buyer B = $bB"
$a, $b = Invoke-Race (Session (Checkout $bA $l.Product) '00:00:04') (Session (Checkout $bB $l.Product))
"   A: $a"; "   B: $b"
$active = [int](Invoke-Sql "SELECT COUNT(*) FROM dbo.vw_ActiveOrderItems WHERE ProductId = $($l.Product)")
$checks['1 A succeeded'] = $a -like 'RESULT=OK*'
$checks['1 B rejected with 51021'] = $b -like 'RESULT=ERR51021*'
$checks['1 B waited for A''s lock (>= 2 s)'] = (Waited $b) -ge 2000
$checks['1 exactly one active order holds the listing'] = $active -eq 1
$orderA = Invoke-Sql "SELECT MAX(OrderId) FROM dbo.vw_ActiveOrderItems WHERE ProductId = $($l.Product)"
Invoke-Sql "EXEC dbo.usp_CancelOrder @OrderId=$orderA, @ActorId=$bA, @Reason=N'concurrency test cleanup'" | Out-Null

# ---------- 2. payment success vs expiry ----------
$l = $pool[1]; $buyer = (Buyers $l.Seller)[0]
$setup = Invoke-Sql @"
DECLARE @out TABLE (OrderId bigint, SellerId int);
DECLARE @pay TABLE (PaymentId bigint);
DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES ($($l.Product));
INSERT @out EXEC dbo.usp_Checkout @BuyerId=$buyer, @ProductIds=@ids, @RecipientName=N'Concurrency', @RecipientPhone='0900000000', @DeliveryAddress=N'Dorm';
DECLARE @o bigint = (SELECT OrderId FROM @out);
EXEC dbo.usp_ConfirmOrder @OrderId=@o, @SellerId=$($l.Seller);
INSERT @pay EXEC dbo.usp_StartPayment @OrderId=@o, @BuyerId=$buyer, @RequestKey='race-pay', @Provider='MoMo';
-- Deadline passed 10 minutes ago (inside the 30-minute grace window); the attempt started before it.
UPDATE dbo.Orders SET ConfirmedAt = DATEADD(minute, -(24 * 60 + 10), SYSUTCDATETIME()) WHERE OrderId=@o;
UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -20, SYSUTCDATETIME()) WHERE RequestKey='race-pay';
SELECT CONCAT(@o, ',', TotalAmount) FROM dbo.Orders WHERE OrderId=@o;
"@
$o2, $amt2 = $setup.Split(',')
"2. Order $o2 (listing $($l.Product)) past its deadline with a payment in flight"
$a, $b = Invoke-Race (Session "EXEC dbo.usp_RecordPaymentResult @RequestKey='race-pay', @ProviderReference='race-ref', @Amount=$amt2, @Success=1;" '00:00:04') `
                     (Session "DECLARE @e TABLE (OrderId bigint, OldStatus varchar(20)); INSERT @e EXEC dbo.usp_ExpirePendingOrders; IF EXISTS (SELECT 1 FROM @e WHERE OrderId=$o2) THROW 59999, 'expired the paid order', 1;")
"   A (payment result): $a"; "   B (expiry):         $b"
$state2 = Invoke-Sql "SELECT CONCAT(o.Status, ',', p.Status) FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId=o.OrderId JOIN dbo.Products p ON p.ProductId=i.ProductId WHERE o.OrderId=$o2"
$checks['2 payment recorded'] = $a -like 'RESULT=OK*'
$checks['2 expiry did not touch the order'] = $b -like 'RESULT=OK*'
$checks['2 expiry waited for the payment''s lock (>= 2 s)'] = (Waited $b) -ge 2000
$checks['2 final state Paid / Reserved'] = $state2 -eq 'Paid,Reserved'

# ---------- 3. expiry vs start of payment ----------
$l = $pool[2]; $buyer = (Buyers $l.Seller)[0]
$o3 = Invoke-Sql @"
DECLARE @out TABLE (OrderId bigint, SellerId int);
DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES ($($l.Product));
INSERT @out EXEC dbo.usp_Checkout @BuyerId=$buyer, @ProductIds=@ids, @RecipientName=N'Concurrency', @RecipientPhone='0900000000', @DeliveryAddress=N'Dorm';
DECLARE @o bigint = (SELECT OrderId FROM @out);
EXEC dbo.usp_ConfirmOrder @OrderId=@o, @SellerId=$($l.Seller);
UPDATE dbo.Orders SET ConfirmedAt = DATEADD(hour, -25, SYSUTCDATETIME()) WHERE OrderId=@o;
SELECT @o;
"@
"3. Order $o3 (listing $($l.Product)) past its deadline, no payment yet"
$a, $b = Invoke-Race (Session "DECLARE @e TABLE (OrderId bigint, OldStatus varchar(20)); INSERT @e EXEC dbo.usp_ExpirePendingOrders;" '00:00:04') `
                     (Session "EXEC dbo.usp_StartPayment @OrderId=$o3, @BuyerId=$buyer, @RequestKey='race-late', @Provider='MoMo';")
"   A (expiry):        $a"; "   B (start payment): $b"
$state3 = Invoke-Sql "SELECT CONCAT(o.Status, ',', p.Status, ',', (SELECT COUNT(*) FROM dbo.Payments WHERE OrderId=o.OrderId)) FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId=o.OrderId JOIN dbo.Products p ON p.ProductId=i.ProductId WHERE o.OrderId=$o3"
$checks['3 expiry succeeded'] = $a -like 'RESULT=OK*'
$checks['3 late payment start rejected (51008)'] = $b -like 'RESULT=ERR51008*'
$checks['3 payment start waited for the expiry''s lock (>= 2 s)'] = (Waited $b) -ge 2000
$checks['3 final state Cancelled / Available / no payment'] = $state3 -eq 'Cancelled,Available,0'

# ---------- 4. expiry beyond grace vs late success callback ----------
$l = $pool[3]; $buyer = (Buyers $l.Seller)[0]
$setup = Invoke-Sql @"
DECLARE @out TABLE (OrderId bigint, SellerId int);
DECLARE @pay TABLE (PaymentId bigint);
DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES ($($l.Product));
INSERT @out EXEC dbo.usp_Checkout @BuyerId=$buyer, @ProductIds=@ids, @RecipientName=N'Concurrency', @RecipientPhone='0900000000', @DeliveryAddress=N'Dorm';
DECLARE @o bigint = (SELECT OrderId FROM @out);
EXEC dbo.usp_ConfirmOrder @OrderId=@o, @SellerId=$($l.Seller);
INSERT @pay EXEC dbo.usp_StartPayment @OrderId=@o, @BuyerId=$buyer, @RequestKey='race-silent', @Provider='MoMo';
-- Deadline passed 60 minutes ago (beyond grace); the attempt started 2 hours ago and was never answered.
UPDATE dbo.Orders SET ConfirmedAt = DATEADD(minute, -(25 * 60), SYSUTCDATETIME()) WHERE OrderId=@o;
UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -120, SYSUTCDATETIME()) WHERE RequestKey='race-silent';
SELECT CONCAT(@o, ',', TotalAmount) FROM dbo.Orders WHERE OrderId=@o;
"@
$o4, $amt4 = $setup.Split(',')
"4. Order $o4 (listing $($l.Product)) beyond the grace window with an unanswered attempt"
$a, $b = Invoke-Race (Session "DECLARE @e TABLE (OrderId bigint, OldStatus varchar(20)); INSERT @e EXEC dbo.usp_ExpirePendingOrders;" '00:00:04') `
                     (Session "EXEC dbo.usp_RecordPaymentResult @RequestKey='race-silent', @ProviderReference='race-silent-ref', @Amount=$amt4, @Success=1;")
"   A (expiry):         $a"; "   B (payment result): $b"
$state4 = Invoke-Sql "SELECT CONCAT(o.Status, ',', (SELECT Status FROM dbo.Payments WHERE RequestKey='race-silent'), ',', p.Status) FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId=o.OrderId JOIN dbo.Products p ON p.ProductId=i.ProductId WHERE o.OrderId=$o4"
$checks['4 expiry succeeded'] = $a -like 'RESULT=OK*'
$checks['4 late success rejected with 51026 (manual refund)'] = $b -like 'RESULT=ERR51026*'
$checks['4 payment result waited for the expiry''s lock (>= 2 s)'] = (Waited $b) -ge 2000
$checks['4 final state Cancelled / Expired / Available'] = $state4 -eq 'Cancelled,Expired,Available'

# ---------- 5. seller confirms just in time vs expiry just after the window ----------
$l = $pool[4]; $buyer = (Buyers $l.Seller)[0]
$o5 = Invoke-Sql @"
DECLARE @out TABLE (OrderId bigint, SellerId int);
DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES ($($l.Product));
INSERT @out EXEC dbo.usp_Checkout @BuyerId=$buyer, @ProductIds=@ids, @RecipientName=N'Concurrency', @RecipientPhone='0900000000', @DeliveryAddress=N'Dorm';
DECLARE @o bigint = (SELECT OrderId FROM @out);
-- Placed almost 24 h ago: the seller window ends 5 seconds from now.
UPDATE dbo.Orders SET CreatedAt = DATEADD(second, 5 - 86400, SYSUTCDATETIME()), ConfirmBy = DATEADD(second, 5, SYSUTCDATETIME()) WHERE OrderId=@o;
SELECT @o;
"@
"5. Order $o5 (listing $($l.Product)): seller window ends in 5 s"
$a, $b = Invoke-Race (Session "EXEC dbo.usp_ConfirmOrder @OrderId=$o5, @SellerId=$($l.Seller);" '00:00:08') `
                     (Session "IF SYSUTCDATETIME() <= (SELECT ConfirmBy FROM dbo.Orders WITH (NOLOCK) WHERE OrderId=$o5) THROW 59998, 'expiry started before the window ended', 1; DECLARE @e TABLE (OrderId bigint, OldStatus varchar(20)); INSERT @e EXEC dbo.usp_ExpirePendingOrders; IF EXISTS (SELECT 1 FROM @e WHERE OrderId=$o5) THROW 59999, 'expired a confirmed order', 1;") 6
"   A (confirm): $a"; "   B (expiry):  $b"
$state5 = Invoke-Sql "SELECT CONCAT(o.Status, ',', p.Status) FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId=o.OrderId JOIN dbo.Products p ON p.ProductId=i.ProductId WHERE o.OrderId=$o5"
$checks['5 seller confirmed inside the window'] = $a -like 'RESULT=OK*'
$checks['5 expiry ran after the window and left the confirmed order alone'] = $b -like 'RESULT=OK*'
$checks['5 expiry waited for the confirmation''s lock (>= 1 s)'] = (Waited $b) -ge 1000
$checks['5 final state AwaitingPayment / Reserved'] = $state5 -eq 'AwaitingPayment,Reserved'

# ---------- 6. expiry vs late seller confirmation ----------
$l = $pool[5]; $buyer = (Buyers $l.Seller)[0]
$o6 = Invoke-Sql @"
DECLARE @out TABLE (OrderId bigint, SellerId int);
DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES ($($l.Product));
INSERT @out EXEC dbo.usp_Checkout @BuyerId=$buyer, @ProductIds=@ids, @RecipientName=N'Concurrency', @RecipientPhone='0900000000', @DeliveryAddress=N'Dorm';
DECLARE @o bigint = (SELECT OrderId FROM @out);
UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -(24 * 60 + 5), SYSUTCDATETIME()), ConfirmBy = DATEADD(minute, -5, SYSUTCDATETIME()) WHERE OrderId=@o;
SELECT @o;
"@
"6. Order $o6 (listing $($l.Product)): seller window ended 5 minutes ago"
$a, $b = Invoke-Race (Session "DECLARE @e TABLE (OrderId bigint, OldStatus varchar(20)); INSERT @e EXEC dbo.usp_ExpirePendingOrders;" '00:00:04') `
                     (Session "EXEC dbo.usp_ConfirmOrder @OrderId=$o6, @SellerId=$($l.Seller);")
"   A (expiry):  $a"; "   B (confirm): $b"
$state6 = Invoke-Sql "SELECT CONCAT(o.Status, ',', p.Status) FROM dbo.Orders o JOIN dbo.OrderItems i ON i.OrderId=o.OrderId JOIN dbo.Products p ON p.ProductId=i.ProductId WHERE o.OrderId=$o6"
$checks['6 expiry succeeded'] = $a -like 'RESULT=OK*'
$checks['6 late confirmation rejected (51007)'] = $b -like 'RESULT=ERR51007*'
$checks['6 confirmation waited for the expiry''s lock (>= 2 s)'] = (Waited $b) -ge 2000
$checks['6 final state Cancelled / Available'] = $state6 -eq 'Cancelled,Available'

$failed = 0
foreach ($k in $checks.Keys) { $ok = $checks[$k]; if (-not $ok) { $failed++ }; "{0}  {1}" -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $k }
"$($checks.Count - $failed)/$($checks.Count) concurrency checks passed"
if ($failed) { exit 1 }
