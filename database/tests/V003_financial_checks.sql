/* =====================================================================
   V003 financial and historical invariants (read-only). Run on an isolated copy after the test suite.
     sqlcmd -S <server> -E -C -I -W -d <TestDb> -i V003_financial_checks.sql
   Every row of the first result must show 0 violations.
   ===================================================================== */
SET NOCOUNT ON;
SELECT check_name, violations FROM (VALUES
 ('quote fee <> order shipping fee',
    (SELECT COUNT(*) FROM dbo.OrderShippingQuotes q JOIN dbo.Orders o ON o.OrderId = q.OrderId WHERE q.Fee <> o.ShippingFee)),
 ('total <> subtotal + shipping',
    (SELECT COUNT(*) FROM dbo.Orders WHERE TotalAmount <> Subtotal + ShippingFee)),
 ('commission not on merchandise only',
    (SELECT COUNT(*) FROM dbo.Orders WHERE CommissionAmount <> ROUND(Subtotal * CommissionRate, 0))),
 ('payout <> subtotal - commission + shipping',
    (SELECT COUNT(*) FROM dbo.Orders WHERE SellerPayoutTotal <> Subtotal - CommissionAmount + ShippingFee)),
 ('subtotal <> sum of item snapshots',
    (SELECT COUNT(*) FROM dbo.Orders o WHERE o.Subtotal <> (SELECT SUM(UnitPrice * Quantity) FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId))),
 ('paid quote within 3 km',
    (SELECT COUNT(*) FROM dbo.OrderShippingQuotes WHERE DistanceKm <= 3.0 AND Fee <> 0)),
 ('quote not simulated',
    (SELECT COUNT(*) FROM dbo.OrderShippingQuotes WHERE IsSimulated <> 1)),
 ('quote pickup not an item area',
    (SELECT COUNT(*) FROM dbo.OrderShippingQuotes q WHERE NOT EXISTS (
        SELECT 1 FROM dbo.OrderItems i JOIN dbo.Products p ON p.ProductId = i.ProductId
        LEFT JOIN dbo.Campuses ca ON ca.CampusId = p.CampusId
        WHERE i.OrderId = q.OrderId AND COALESCE(p.PickupZoneId, ca.ZoneId) = q.PickupZoneId))),
 -- V001 settlements (merchandise proceeds only, no delivery fee) were kept unchanged by V002 (approved decision, V002 step 5b).
 -- trg_SellerSettlements_Guard makes every later settlement copy the order's ShippingFee, so only V001 rows can match LEGACY.
 ('settlement shipping <> order shipping (excluding V001 legacy)',
    (SELECT COUNT(*) FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId WHERE s.ShippingFee <> o.ShippingFee AND NOT (s.ShippingFee = 0 AND o.ShippingFee > 0 AND s.Amount = s.MerchandiseSubtotal - s.CommissionAmount))),
 ('settlement amount <> order payout (excluding V001 legacy)',
    (SELECT COUNT(*) FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId WHERE s.Amount <> o.SellerPayoutTotal AND NOT (s.ShippingFee = 0 AND o.ShippingFee > 0 AND s.Amount = s.MerchandiseSubtotal - s.CommissionAmount))),
 ('settlement breakdown inconsistent',
    (SELECT COUNT(*) FROM dbo.SellerSettlements WHERE Amount <> MerchandiseSubtotal - CommissionAmount + ShippingFee)),
 ('succeeded payment amount <> order total',
    (SELECT COUNT(*) FROM dbo.Payments p JOIN dbo.Orders o ON o.OrderId = p.OrderId WHERE p.Status = 'Succeeded' AND p.Amount <> o.TotalAmount)),
 ('payment provider <> order provider',
    (SELECT COUNT(*) FROM dbo.Payments p JOIN dbo.Orders o ON o.OrderId = p.OrderId WHERE o.PaymentProvider IS NOT NULL AND p.Provider <> o.PaymentProvider)),
 ('more than one succeeded payment per order',
    (SELECT COUNT(*) FROM (SELECT OrderId FROM dbo.Payments WHERE Status = 'Succeeded' GROUP BY OrderId HAVING COUNT(*) > 1) d)),
 ('listing in two active orders',
    (SELECT COUNT(*) FROM (SELECT ProductId FROM dbo.vw_ActiveOrderItems GROUP BY ProductId HAVING COUNT(*) > 1) d)),
 ('orphan quote (no items)',
    (SELECT COUNT(*) FROM dbo.OrderShippingQuotes q WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderItems i WHERE i.OrderId = q.OrderId))),
 ('user without campus or university (non-admin)',
    (SELECT COUNT(*) FROM dbo.Users WHERE Role <> 'Admin' AND CampusId IS NULL AND DeclaredUniversityName IS NULL)),
 ('listing without campus or pickup area',
    (SELECT COUNT(*) FROM dbo.Products WHERE CampusId IS NULL AND PickupZoneId IS NULL))
) AS c(check_name, violations);

-- V001 legacy settlements (informational; expected: orders 1-4 of the demo seed).
SELECT s.OrderId, s.Status, s.Amount, s.ShippingFee AS SettlementShipping, o.ShippingFee AS OrderShipping
FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId WHERE (s.ShippingFee = 0 AND o.ShippingFee > 0 AND s.Amount = s.MerchandiseSubtotal - s.CommissionAmount) ORDER BY s.OrderId;

-- Coverage of the run (informational).
SELECT (SELECT COUNT(*) FROM dbo.OrderShippingQuotes) AS quotes,
       (SELECT COUNT(*) FROM dbo.OrderShippingQuotes WHERE Fee = 0) AS freeQuotes,
       (SELECT COUNT(DISTINCT Fee) FROM dbo.OrderShippingQuotes) AS distinctFees,
       (SELECT COUNT(*) FROM dbo.Payments WHERE Provider = 'BankQR') AS bankQrPayments,
       (SELECT COUNT(*) FROM dbo.Payments WHERE Provider = 'BankQR' AND Status = 'Succeeded') AS bankQrSucceeded,
       (SELECT COUNT(*) FROM dbo.ProductPromotions WHERE Provider = 'BankQR') AS bankQrPromotions,
       (SELECT COUNT(*) FROM dbo.Users WHERE CampusId IS NULL) AS usersWithoutCampus,
       (SELECT COUNT(*) FROM dbo.Products WHERE CampusId IS NULL) AS listingsWithoutCampus,
       (SELECT COUNT(*) FROM dbo.SellerSettlements s JOIN dbo.OrderShippingQuotes q ON q.OrderId = s.OrderId) AS settlementsWithQuote;

-- Demo orders 1-12 (created before V003): unchanged money columns, no quote, shown as LEGACY.
SELECT OrderId, Status, Subtotal, ShippingFee, TotalAmount, CommissionAmount, SellerPayoutTotal,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.OrderShippingQuotes q WHERE q.OrderId = o.OrderId) THEN 'QUOTE' ELSE 'LEGACY' END AS shipping
FROM dbo.Orders o WHERE OrderId <= 12 ORDER BY OrderId;
