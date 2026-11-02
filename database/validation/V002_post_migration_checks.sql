/* =====================================================================
   V002 post-migration checks - READ ONLY. Safe on the live database.
   Compare the INFO rows with the output of V002_pre_migration_checks.sql:
   order count and money totals must be identical.
   sqlcmd -S <server> -E -C -I -d UniMarketJava -i V002_post_migration_checks.sql
   ===================================================================== */
SET NOCOUNT ON;

DECLARE @checks TABLE (Seq int IDENTITY, CheckName nvarchar(200), Result varchar(4), Detail nvarchar(400));
DECLARE @n int;

SET @n = 0;
IF OBJECT_ID('dbo.SchemaMigrations', 'U') IS NOT NULL
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.SchemaMigrations WHERE Version = ''V002''', N'@n int OUTPUT', @n OUTPUT;
INSERT @checks VALUES (N'V002 recorded in SchemaMigrations', IIF(@n = 1, 'PASS', 'FAIL'), NULL);
INSERT @checks VALUES (N'Orders no longer has ProductId / ProductTitle / ItemPrice',
    IIF(COL_LENGTH('dbo.Orders', 'ProductId') IS NULL AND COL_LENGTH('dbo.Orders', 'ProductTitle') IS NULL AND COL_LENGTH('dbo.Orders', 'ItemPrice') IS NULL, 'PASS', 'FAIL'), NULL);

IF OBJECT_ID('dbo.OrderItems', 'U') IS NOT NULL
BEGIN
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders o WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId)', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Every order has at least one item', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' empty orders'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.OrderItems i WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.OrderId = i.OrderId)', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'No orphan order items', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orphans'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.OrderItems i JOIN dbo.Orders o ON o.OrderId = i.OrderId JOIN dbo.Products p ON p.ProductId = i.ProductId
        WHERE i.SellerId <> o.SellerId OR p.SellerId <> o.SellerId', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Item seller = order seller = product seller', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' mismatches'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders o WHERE o.Subtotal <> (SELECT SUM(i.UnitPrice * i.Quantity) FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId)', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Order subtotal = sum of item prices', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders WHERE CommissionAmount <> ROUND(Subtotal * 0.03, 0) OR SellerProceeds <> Subtotal - CommissionAmount OR TotalAmount <> Subtotal + ShippingFee', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'3% commission on subtotal; proceeds and total consistent', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM (SELECT i.ProductId FROM dbo.OrderItems i JOIN dbo.Orders o ON o.OrderId = i.OrderId WHERE o.Status <> ''Cancelled'' GROUP BY i.ProductId HAVING COUNT(*) > 1) x', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'No listing in two active orders', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' listings'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.OrderItems i JOIN dbo.Orders o ON o.OrderId = i.OrderId JOIN dbo.Products p ON p.ProductId = i.ProductId
        WHERE (o.Status IN (''Pending'',''AwaitingPayment'',''Paid'',''Delivering'') AND p.Status <> ''Reserved'') OR (o.Status = ''Completed'' AND p.Status <> ''Sold'')', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Listing status matches order status', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' mismatches'));

    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders WHERE PaymentProvider IS NULL AND Status NOT IN (''Pending'',''AwaitingPayment'',''Cancelled'')', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'Paid / delivering / completed orders have a payment provider', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));

    -- D1: seller payout = merchandise proceeds + delivery fee.
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders WHERE SellerPayoutTotal <> Subtotal - CommissionAmount + ShippingFee', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'D1 seller payout = subtotal - commission + delivery fee', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));
    -- D2: payment deadline = confirmation + 24 h.
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders WHERE ISNULL(PaymentDueAt, ''19000101'') <> ISNULL(DATEADD(hour, 24, ConfirmedAt), ''19000101'')', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'D2 PaymentDueAt = ConfirmedAt + 24 h', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders WHERE Status = ''AwaitingPayment'' AND PaymentDueAt <= SYSUTCDATETIME()', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'D2 unpaid orders past their deadline (expired by the next usp_ExpirePendingOrders run)', 'INFO', CONCAT(@n, N' orders'));
    -- D1/D4/D6: settlement breakdown.
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId
        WHERE s.MerchandiseSubtotal <> o.Subtotal OR s.CommissionAmount <> o.CommissionAmount OR s.Amount <> s.MerchandiseSubtotal - s.CommissionAmount + s.ShippingFee
           OR s.ShippingFee NOT IN (0, o.ShippingFee)', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'D1/D4 settlement breakdown matches its order', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' settlements'));
    EXEC sp_executesql N'SELECT @n = COUNT(*) FROM dbo.SellerSettlements WHERE Status = ''Released'' AND ReleasedBy IS NULL', N'@n int OUTPUT', @n OUTPUT;
    INSERT @checks VALUES (N'D6 released settlements without admin confirmation (V001 demo rows only)', 'INFO', CONCAT(@n, N' settlements'));
    -- D3: dispute table present, at most one open dispute per order.
    INSERT @checks VALUES (N'D3 OrderDisputes table and one-open-dispute index exist',
        IIF(OBJECT_ID('dbo.OrderDisputes', 'U') IS NOT NULL AND INDEXPROPERTY(OBJECT_ID('dbo.OrderDisputes'), 'UX_OrderDisputes_OneOpen', 'IsUnique') = 1, 'PASS', 'FAIL'), NULL);

    DECLARE @detail nvarchar(400);
    EXEC sp_executesql N'SELECT @d = CONCAT(N''orders='', COUNT(*), N''; items='', SUM(Subtotal), N''; shipping='', SUM(ShippingFee),
        N''; total='', SUM(TotalAmount), N''; commission='', SUM(CommissionAmount), N''; proceeds='', SUM(SellerProceeds),
        N''; order items='', (SELECT COUNT(*) FROM dbo.OrderItems)) FROM dbo.Orders', N'@d nvarchar(400) OUTPUT', @detail OUTPUT;
    INSERT @checks VALUES (N'Order totals (must equal the pre-migration values)', 'INFO', @detail);
END

SELECT @n = COUNT(*) FROM (SELECT OrderId FROM dbo.Payments WHERE Status = 'Succeeded' GROUP BY OrderId HAVING COUNT(*) > 1) x;
INSERT @checks VALUES (N'At most one successful payment per order', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' orders'));

SELECT @n = COUNT(*) FROM dbo.Orders o WHERE o.Status = 'Completed' AND NOT EXISTS (SELECT 1 FROM dbo.SellerSettlements s WHERE s.OrderId = o.OrderId);
INSERT @checks VALUES (N'Every completed order has a settlement', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' missing'));

INSERT @checks
SELECT N'Related rows (must equal the pre-migration values)', 'INFO',
    CONCAT(N'payments=', (SELECT COUNT(*) FROM dbo.Payments), N'; deliveries=', (SELECT COUNT(*) FROM dbo.Deliveries),
           N'; settlements=', (SELECT COUNT(*) FROM dbo.SellerSettlements), N'; reviews=', (SELECT COUNT(*) FROM dbo.Reviews),
           N'; history=', (SELECT COUNT(*) FROM dbo.OrderStatusHistory), N'; products=', (SELECT COUNT(*) FROM dbo.Products));

-- Every foreign key and CHECK constraint is trusted and holds for all rows.
SELECT @n = COUNT(*) FROM sys.foreign_keys WHERE is_not_trusted = 1 OR is_disabled = 1;
INSERT @checks VALUES (N'All foreign keys enabled and trusted', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' untrusted'));
SELECT @n = COUNT(*) FROM sys.check_constraints WHERE is_not_trusted = 1 OR is_disabled = 1;
INSERT @checks VALUES (N'All CHECK constraints enabled and trusted', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' untrusted'));

SELECT @n = COUNT(*) FROM sys.objects o WHERE o.type IN ('P', 'V', 'TR', 'FN', 'IF', 'TF') AND o.is_ms_shipped = 0
    AND EXISTS (SELECT 1 FROM sys.sql_expression_dependencies d WHERE d.referencing_id = o.object_id AND d.referenced_id IS NULL AND d.referenced_schema_name IS NOT NULL);
INSERT @checks VALUES (N'No module references a missing object', IIF(@n = 0, 'PASS', 'FAIL'), CONCAT(@n, N' modules'));

SELECT Seq, Result, CheckName, Detail FROM @checks ORDER BY Seq;
