/* =====================================================================
   V003 deployment checks - READ-ONLY. Run the same file before and after the migration and compare the outputs.
     sqlcmd -S <server> -E -C -I -W -s "|" -d UniMarketJava -i V003_pre_post_checks.sql -o <file>
   Section A must be identical before and after (existing data and money unchanged).
   Section B shows the schema state (before: V002 only; after: V003 objects present, all trusted).
   ===================================================================== */
SET NOCOUNT ON;

PRINT '=== A. Existing data (must be identical before and after) ===';
SELECT 'rows' AS k, t.name AS item, CAST(SUM(p.rows) AS varchar(30)) AS v
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name NOT IN ('LocationZones', 'OrderShippingQuotes', 'SchemaMigrations')
GROUP BY t.name
UNION ALL SELECT 'money', 'Orders.Subtotal', CAST(SUM(Subtotal) AS varchar(30)) FROM dbo.Orders
UNION ALL SELECT 'money', 'Orders.ShippingFee', CAST(SUM(ShippingFee) AS varchar(30)) FROM dbo.Orders
UNION ALL SELECT 'money', 'Orders.TotalAmount', CAST(SUM(TotalAmount) AS varchar(30)) FROM dbo.Orders
UNION ALL SELECT 'money', 'Orders.CommissionAmount', CAST(SUM(CommissionAmount) AS varchar(30)) FROM dbo.Orders
UNION ALL SELECT 'money', 'Orders.SellerPayoutTotal', CAST(SUM(SellerPayoutTotal) AS varchar(30)) FROM dbo.Orders
UNION ALL SELECT 'money', 'Payments.Amount', CAST(SUM(Amount) AS varchar(30)) FROM dbo.Payments
UNION ALL SELECT 'money', 'SellerSettlements.Amount', CAST(SUM(Amount) AS varchar(30)) FROM dbo.SellerSettlements
UNION ALL SELECT 'money', 'ProductPromotions.Amount', CAST(SUM(Amount) AS varchar(30)) FROM dbo.ProductPromotions
UNION ALL SELECT 'checksum', 'Orders', CAST(CHECKSUM_AGG(CHECKSUM(OrderId, BuyerId, SellerId, Status, Subtotal, ShippingFee, PaymentProvider, ConfirmedAt, PaidAt, CompletedAt, CancelledAt)) AS varchar(30)) FROM dbo.Orders
UNION ALL SELECT 'checksum', 'OrderItems', CAST(CHECKSUM_AGG(CHECKSUM(OrderId, ProductId, UnitPrice, Quantity, ProductTitle)) AS varchar(30)) FROM dbo.OrderItems
UNION ALL SELECT 'checksum', 'Payments', CAST(CHECKSUM_AGG(CHECKSUM(PaymentId, OrderId, Provider, Status, Amount, ProviderReference)) AS varchar(30)) FROM dbo.Payments
UNION ALL SELECT 'checksum', 'SellerSettlements', CAST(CHECKSUM_AGG(CHECKSUM(OrderId, Status, Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee, PayoutReference, ReleasedAt)) AS varchar(30)) FROM dbo.SellerSettlements
UNION ALL SELECT 'checksum', 'Users', CAST(CHECKSUM_AGG(CHECKSUM(UserId, Email, PasswordHash, FullName, CampusId, Role, Status, EmailVerifiedAt)) AS varchar(30)) FROM dbo.Users
UNION ALL SELECT 'checksum', 'Products', CAST(CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, CampusId, Title, Price, Status, ModerationStatus)) AS varchar(30)) FROM dbo.Products
UNION ALL SELECT 'catalog', 'vw_ProductCatalog rows', CAST(COUNT(*) AS varchar(30)) FROM dbo.vw_ProductCatalog
UNION ALL SELECT 'legacy', 'V001 settlements (no shipping)', CAST(COUNT(*) AS varchar(30))
          FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId
          WHERE s.ShippingFee = 0 AND o.ShippingFee > 0 AND s.Amount = s.MerchandiseSubtotal - s.CommissionAmount
ORDER BY k, item;

PRINT '=== B. Schema state ===';
SELECT 'migrations' AS k, STRING_AGG(Version, ',') WITHIN GROUP (ORDER BY Version) AS v FROM dbo.SchemaMigrations
UNION ALL SELECT 'V003 objects present (of 4)', CAST(
          (CASE WHEN OBJECT_ID('dbo.LocationZones') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN OBJECT_ID('dbo.OrderShippingQuotes') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN OBJECT_ID('dbo.usp_CheckoutWithShipping') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN TYPE_ID('dbo.SellerShippingList') IS NOT NULL THEN 1 ELSE 0 END) AS varchar(10))
UNION ALL SELECT 'untrusted or disabled FKs', CAST(COUNT(*) AS varchar(10)) FROM sys.foreign_keys WHERE is_not_trusted = 1 OR is_disabled = 1
UNION ALL SELECT 'untrusted or disabled CHECKs', CAST(COUNT(*) AS varchar(10)) FROM sys.check_constraints WHERE is_not_trusted = 1 OR is_disabled = 1
UNION ALL SELECT 'provider CHECKs allowing BankQR', CAST(COUNT(*) AS varchar(10)) FROM sys.check_constraints WHERE definition LIKE '%BankQR%'
UNION ALL SELECT 'invalid modules', CAST(COUNT(*) AS varchar(10)) FROM sys.sql_modules m
          WHERE OBJECTPROPERTY(m.object_id, 'IsProcedure') = 1 AND m.definition IS NULL;
IF OBJECT_ID('dbo.LocationZones') IS NOT NULL
    EXEC (N'SELECT ''zones'' AS k, CAST(COUNT(*) AS varchar(10)) AS v FROM dbo.LocationZones
            UNION ALL SELECT ''campuses without zone'', CAST(COUNT(*) AS varchar(10)) FROM dbo.Campuses WHERE ZoneId IS NULL
            UNION ALL SELECT ''catalog rows without area'', CAST(COUNT(*) AS varchar(10)) FROM dbo.vw_ProductCatalog WHERE PickupZoneId IS NULL
            UNION ALL SELECT ''quotes'', CAST(COUNT(*) AS varchar(10)) FROM dbo.OrderShippingQuotes
            UNION ALL SELECT ''users without campus'', CAST(COUNT(*) AS varchar(10)) FROM dbo.Users WHERE CampusId IS NULL');
-- Permissions of the application login (schema-level GRANT EXECUTE on dbo covers the new procedure and table type).
IF OBJECT_ID('dbo.usp_CheckoutWithShipping') IS NOT NULL AND USER_ID('unimarket_app') IS NOT NULL
BEGIN
    EXECUTE AS USER = 'unimarket_app';
    SELECT 'unimarket_app can execute usp_CheckoutWithShipping' AS k,
           CAST(HAS_PERMS_BY_NAME('dbo.usp_CheckoutWithShipping', 'OBJECT', 'EXECUTE') AS varchar(10)) AS v
    UNION ALL SELECT 'unimarket_app can use SellerShippingList', CAST(HAS_PERMS_BY_NAME('dbo.SellerShippingList', 'TYPE', 'EXECUTE') AS varchar(10))
    UNION ALL SELECT 'unimarket_app can read LocationZones', CAST(HAS_PERMS_BY_NAME('dbo.LocationZones', 'OBJECT', 'SELECT') AS varchar(10))
    UNION ALL SELECT 'unimarket_app can read OrderShippingQuotes', CAST(HAS_PERMS_BY_NAME('dbo.OrderShippingQuotes', 'OBJECT', 'SELECT') AS varchar(10));
    REVERT;
END
