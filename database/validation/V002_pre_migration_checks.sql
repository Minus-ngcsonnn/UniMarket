/* =====================================================================
   V002 pre-migration checks - READ ONLY. Safe on the live database.
   Run before V002 and keep the output: the post-migration checks must
   report the same order count and money totals.
   sqlcmd -S <server> -E -C -I -d UniMarketJava -i V002_pre_migration_checks.sql
   ===================================================================== */
SET NOCOUNT ON;

DECLARE @checks TABLE (Seq int IDENTITY, CheckName nvarchar(200), Result varchar(4), Detail nvarchar(400));
DECLARE @isBaseline bit = CASE WHEN COL_LENGTH('dbo.Orders', 'ProductId') IS NOT NULL AND OBJECT_ID('dbo.OrderItems', 'U') IS NULL THEN 1 ELSE 0 END;

INSERT @checks VALUES (N'Schema is baseline V001 (Orders.ProductId exists, OrderItems absent)', IIF(@isBaseline = 1, 'PASS', 'FAIL'), NULL);

IF @isBaseline = 1
BEGIN
    DECLARE @n int, @detail nvarchar(400);

    -- Columns of the old model are read through dynamic SQL so this file still compiles after V002.
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders o JOIN dbo.Products p ON p.ProductId = o.ProductId WHERE p.SellerId <> o.SellerId',
        N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Every order''s seller owns its product', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' mismatches'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM (SELECT ProductId FROM dbo.Orders WHERE Status <> ''Cancelled'' GROUP BY ProductId HAVING COUNT(*) > 1) x',
        N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'No listing in two active orders', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' listings'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders o JOIN dbo.Products p ON p.ProductId = o.ProductId
        WHERE (o.Status IN (''Pending'',''AwaitingPayment'',''Paid'',''Delivering'') AND p.Status <> ''Reserved'')
           OR (o.Status = ''Completed'' AND p.Status <> ''Sold'')',
        N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Listing status matches order status', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' mismatches'));

    EXEC sp_executesql N'SELECT @d = CONCAT(N''orders='', COUNT(*), N''; items='', SUM(ItemPrice), N''; shipping='', SUM(ShippingFee),
        N''; total='', SUM(TotalAmount), N''; commission='', SUM(CommissionAmount), N''; proceeds='', SUM(SellerProceeds)) FROM dbo.Orders',
        N'@d nvarchar(400) OUTPUT', @detail OUTPUT;
    INSERT @checks VALUES (N'Order totals (keep for comparison)', 'INFO', @detail);
END

SELECT @n = COUNT(*) FROM dbo.Payments WHERE Status = 'Pending';
INSERT @checks VALUES (N'No payment attempt is Pending', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' pending'));

SELECT @n = COUNT(*) FROM dbo.Orders o WHERE o.Status = 'Completed' AND NOT EXISTS (SELECT 1 FROM dbo.SellerSettlements s WHERE s.OrderId = o.OrderId);
INSERT @checks VALUES (N'Every completed order has a settlement', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' missing'));

SELECT @n = COUNT(*) FROM (SELECT OrderId FROM dbo.Payments WHERE Status = 'Succeeded' GROUP BY OrderId HAVING COUNT(*) > 1) x;
INSERT @checks VALUES (N'At most one successful payment per order', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));

INSERT @checks
SELECT N'Related rows (keep for comparison)', 'INFO',
    CONCAT(N'payments=', (SELECT COUNT(*) FROM dbo.Payments), N'; deliveries=', (SELECT COUNT(*) FROM dbo.Deliveries),
           N'; settlements=', (SELECT COUNT(*) FROM dbo.SellerSettlements), N'; reviews=', (SELECT COUNT(*) FROM dbo.Reviews),
           N'; history=', (SELECT COUNT(*) FROM dbo.OrderStatusHistory), N'; products=', (SELECT COUNT(*) FROM dbo.Products));

INSERT @checks
SELECT N'Last full backup of this database', IIF(MAX(backup_finish_date) IS NULL, 'WARN', 'INFO'),
    COALESCE(CONVERT(nvarchar(100), MAX(backup_finish_date), 120), N'none - take a backup before migrating')
FROM msdb.dbo.backupset WHERE database_name = DB_NAME() AND type = 'D' AND is_copy_only = 0;

SELECT Seq, Result, CheckName, Detail FROM @checks ORDER BY Seq;
