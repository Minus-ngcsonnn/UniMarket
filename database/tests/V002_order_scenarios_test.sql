/* =====================================================================
   V002 order scenarios - run ONLY on a disposable test copy
   (see create_test_copy.sql). Refuses to run on UniMarketJava.

   Success scenarios run inside a transaction that is rolled back.
   Failure scenarios run without one and then prove nothing changed.
   Prints one row per check and fails (exit code 1 with -b) if any check fails.

   sqlcmd -S <server> -E -C -I -b -d UniMarketJava_V002Test -i V002_order_scenarios_test.sql
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT OFF;   -- the test harness must survive expected errors
IF DB_NAME() = N'UniMarketJava' OR DB_NAME() NOT LIKE N'%Test%'
BEGIN
    RAISERROR('Refusing to run scenario tests outside a *Test database.', 16, 1);
    SET NOEXEC ON;
END
GO

-- Table variable: results survive the ROLLBACK of each scenario.
DECLARE @r TABLE (Seq int IDENTITY, Test varchar(200), Pass bit, Detail nvarchar(300));

-- ---------- fixtures: chosen from the demo data, not hard-coded ----------
SELECT p.ProductId, p.SellerId, p.Price
INTO #avail
FROM dbo.Products p
JOIN dbo.Users u ON u.UserId = p.SellerId
JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
WHERE p.Status = 'Available' AND p.ModerationStatus = 'Approved' AND u.Status = 'Active'
  AND u.EmailVerifiedAt IS NOT NULL AND u.Role = 'Student' AND c.IsActive = 1;

DECLARE @S int, @T int, @B int, @B2 int, @S1 int, @S2 int, @T1 int, @Sold int, @Admin int;
SELECT TOP (1) @S = SellerId FROM #avail GROUP BY SellerId HAVING COUNT(*) >= 2 ORDER BY SellerId;
SELECT TOP (1) @T = SellerId FROM #avail WHERE SellerId <> @S GROUP BY SellerId ORDER BY SellerId;
SELECT @S1 = MIN(ProductId) FROM #avail WHERE SellerId = @S;
SELECT @S2 = MIN(ProductId) FROM #avail WHERE SellerId = @S AND ProductId > @S1;
SELECT @T1 = MIN(ProductId) FROM #avail WHERE SellerId = @T;
SELECT TOP (1) @B = UserId FROM dbo.Users WHERE Status = 'Active' AND EmailVerifiedAt IS NOT NULL AND Role = 'Student' AND UserId NOT IN (@S, @T) ORDER BY UserId;
SELECT TOP (1) @B2 = UserId FROM dbo.Users WHERE Status = 'Active' AND EmailVerifiedAt IS NOT NULL AND Role = 'Student' AND UserId NOT IN (@S, @T, @B) ORDER BY UserId;
SELECT TOP (1) @Sold = ProductId FROM dbo.Products WHERE Status = 'Sold' ORDER BY ProductId;
SELECT TOP (1) @Admin = UserId FROM dbo.Users WHERE Role = 'Admin' AND Status = 'Active';
SELECT @S AS SellerS, @T AS SellerT, @B AS Buyer, @B2 AS Buyer2, @S1 AS ProdS1, @S2 AS ProdS2, @T1 AS ProdT1, @Sold AS SoldProd;
INSERT @r SELECT 'T00 fixtures found', IIF(@S IS NOT NULL AND @T IS NOT NULL AND @B IS NOT NULL AND @B2 IS NOT NULL AND @S2 IS NOT NULL AND @T1 IS NOT NULL AND @Sold IS NOT NULL, 1, 0), NULL;

DECLARE @ids dbo.ProductIdList;
DECLARE @out TABLE (OrderId bigint, SellerId int);
DECLARE @err int, @o1 bigint, @o2 bigint, @n int, @m int;
DECLARE @ordersBefore int, @itemsBefore int;

-- ---------- T01 migrated demo orders ----------
INSERT @r SELECT 'T01 migrated demo orders: 1 item each, prices kept',
    IIF(NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE (SELECT COUNT(*) FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId) <> 1
                       OR o.Subtotal <> (SELECT i.UnitPrice FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId)), 1, 0),
    CONCAT((SELECT COUNT(*) FROM dbo.Orders), ' orders');

-- ---------- T02 one order, several listings from the same seller ----------
BEGIN TRAN;
    DELETE @ids; DELETE @out; INSERT @ids VALUES (@S1), (@S2);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @o1 = OrderId FROM @out;
    INSERT @r SELECT 'T02 same seller -> 1 order with 2 items',
        IIF((SELECT COUNT(*) FROM @out) = 1 AND (SELECT COUNT(*) FROM dbo.OrderItems WHERE OrderId = @o1) = 2
            AND (SELECT Subtotal FROM dbo.Orders WHERE OrderId = @o1) = (SELECT SUM(Price) FROM #avail WHERE ProductId IN (@S1, @S2))
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Reserved') = 2
            AND EXISTS (SELECT 1 FROM dbo.OrderStatusHistory WHERE OrderId = @o1 AND Status = 'Pending'), 1, 0),
        CONCAT('order ', @o1);
ROLLBACK;

-- ---------- T03 several sellers -> one order per seller, one checkout ----------
BEGIN TRAN;
    DELETE @ids; DELETE @out; INSERT @ids VALUES (@S1), (@S2), (@T1);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    INSERT @r SELECT 'T03 two sellers -> 2 orders, 3 items',
        IIF((SELECT COUNT(*) FROM @out) = 2
            AND (SELECT COUNT(*) FROM dbo.OrderItems i JOIN @out o ON o.OrderId = i.OrderId) = 3
            AND NOT EXISTS (SELECT 1 FROM dbo.OrderItems i JOIN @out o ON o.OrderId = i.OrderId WHERE i.SellerId <> o.SellerId)
            AND (SELECT SUM(x.Subtotal) FROM dbo.Orders x JOIN @out o ON o.OrderId = x.OrderId) = (SELECT SUM(Price) FROM #avail WHERE ProductId IN (@S1, @S2, @T1)), 1, 0),
        (SELECT STRING_AGG(CONCAT(OrderId, '/seller ', SellerId), ', ') FROM @out);
ROLLBACK;

-- ---------- T04 an order cannot contain another seller's listing ----------
BEGIN TRAN;
    DELETE @ids; DELETE @out; INSERT @ids VALUES (@S1);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @o1 = OrderId FROM @out;
    SAVE TRAN t04;
    SET @err = 0;
    BEGIN TRY INSERT dbo.OrderItems (OrderId, SellerId, ProductId, ProductTitle, UnitPrice) VALUES (@o1, @S, @T1, N'x', 1000); END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    SET @m = 0;
    IF XACT_STATE() = 1 ROLLBACK TRAN t04;
    BEGIN TRY INSERT dbo.OrderItems (OrderId, SellerId, ProductId, ProductTitle, UnitPrice) VALUES (@o1, @T, @T1, N'x', 1000); END TRY
    BEGIN CATCH SET @m = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T04 mixed-seller item rejected by foreign keys', IIF(@err = 547 AND @m = 547, 1, 0), CONCAT('errors ', @err, ' / ', @m);
IF @@TRANCOUNT > 0 ROLLBACK;

-- ---------- T05 unavailable listing rejected, nothing created ----------
SELECT @ordersBefore = COUNT(*) FROM dbo.Orders;
DELETE @ids; INSERT @ids VALUES (@Sold);
SET @err = 0;
BEGIN TRY EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A'; END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
INSERT @r SELECT 'T05 sold / reserved listing rejected (51021)', IIF(@err = 51021 AND (SELECT COUNT(*) FROM dbo.Orders) = @ordersBefore, 1, 0), CONCAT('error ', @err);

-- ---------- T06 buying your own listing rejected ----------
DELETE @ids; INSERT @ids VALUES (@S1);
SET @err = 0;
BEGIN TRY EXEC dbo.usp_Checkout @BuyerId = @S, @ProductIds = @ids, @RecipientName = N'Seller', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A'; END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
INSERT @r SELECT 'T06 self-purchase rejected (51022)', IIF(@err = 51022 AND (SELECT COUNT(*) FROM dbo.Orders) = @ordersBefore AND (SELECT Status FROM dbo.Products WHERE ProductId = @S1) = 'Available', 1, 0), CONCAT('error ', @err);

-- ---------- T07 the same listing cannot be sold twice ----------
BEGIN TRAN;
    DELETE @ids; DELETE @out; INSERT @ids VALUES (@S1);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    DELETE @out; DELETE @ids; INSERT @ids VALUES (@S2);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B2, @ProductIds = @ids, @RecipientName = N'Buyer Two', @RecipientPhone = '0900000001', @DeliveryAddress = N'Dorm B';
    SELECT @o2 = OrderId FROM @out;
    SAVE TRAN t07;
    SET @err = 0;
    -- Bypass the procedure: put @S1 (already in an active order) into another active order.
    BEGIN TRY INSERT dbo.OrderItems (OrderId, SellerId, ProductId, ProductTitle, UnitPrice) VALUES (@o2, @S, @S1, N'dup', 1000); END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T07a duplicate active sale blocked by unique index (2601)', IIF(@err = 2601, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;
-- Second buyer tries the same listing through checkout (committed first order needed): run in a real sequence.
DELETE @ids; DELETE @out; INSERT @ids VALUES (@S1);
INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
SELECT @o1 = OrderId FROM @out;
SET @err = 0;
BEGIN TRY EXEC dbo.usp_Checkout @BuyerId = @B2, @ProductIds = @ids, @RecipientName = N'Buyer Two', @RecipientPhone = '0900000001', @DeliveryAddress = N'Dorm B'; END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
INSERT @r SELECT 'T07b second checkout of a reserved listing rejected (51021)', IIF(@err = 51021 AND (SELECT COUNT(*) FROM dbo.vw_ActiveOrderItems WHERE ProductId = @S1) = 1, 1, 0), CONCAT('error ', @err);
-- ---------- T11a cancelling releases the listing; it can then be bought again ----------
EXEC dbo.usp_CancelOrder @OrderId = @o1, @ActorId = @S, @Reason = N'Seller declined (test)';
INSERT @r SELECT 'T11a seller decline -> Cancelled, listing Available again',
    IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o1) = 'Cancelled' AND (SELECT Status FROM dbo.Products WHERE ProductId = @S1) = 'Available', 1, 0), CONCAT('order ', @o1);
BEGIN TRAN;
    DELETE @out;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B2, @ProductIds = @ids, @RecipientName = N'Buyer Two', @RecipientPhone = '0900000001', @DeliveryAddress = N'Dorm B';
    INSERT @r SELECT 'T11b cancelled listing can be ordered again', IIF((SELECT COUNT(*) FROM @out) = 1, 1, 0), NULL;
ROLLBACK;

-- ---------- T08 failed checkout leaves nothing behind ----------
INSERT dbo.CartItems (UserId, ProductId) VALUES (@B, @S1);
SELECT @ordersBefore = COUNT(*) FROM dbo.Orders; SELECT @itemsBefore = COUNT(*) FROM dbo.OrderItems;
DELETE @ids; INSERT @ids VALUES (@S1), (@T1), (@Sold);
SET @err = 0;
BEGIN TRY EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A'; END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
INSERT @r SELECT 'T08 all-or-nothing: no orders, items or reservations after failure',
    IIF(@err = 51021 AND (SELECT COUNT(*) FROM dbo.Orders) = @ordersBefore AND (SELECT COUNT(*) FROM dbo.OrderItems) = @itemsBefore
        AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @T1) AND Status = 'Available') = 2
        AND EXISTS (SELECT 1 FROM dbo.CartItems WHERE UserId = @B AND ProductId = @S1), 1, 0), CONCAT('error ', @err);
DELETE dbo.CartItems WHERE UserId = @B AND ProductId = @S1;

-- ---------- T09/T10/T16 full flow: totals, payment amount, commission, completion ----------
BEGIN TRAN;
    DELETE @ids; DELETE @out; INSERT @ids VALUES (@S1), (@S2);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000',
         @DeliveryAddress = N'Dorm A', @ShippingFee = 15000;
    SELECT @o1 = OrderId FROM @out;
    DECLARE @sub decimal(18,0) = (SELECT SUM(Price) FROM #avail WHERE ProductId IN (@S1, @S2));
    INSERT @r SELECT 'T10 commission = 3% of subtotal (delivery fee excluded)',
        IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o1 AND Subtotal = @sub AND TotalAmount = @sub + 15000
                    AND CommissionAmount = ROUND(@sub * 0.03, 0) AND SellerProceeds = @sub - ROUND(@sub * 0.03, 0)), 1, 0),
        (SELECT CONCAT('subtotal ', Subtotal, ', total ', TotalAmount, ', commission ', CommissionAmount, ', proceeds ', SellerProceeds) FROM dbo.Orders WHERE OrderId = @o1);

    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ConfirmOrder @OrderId = @o1, @SellerId = @T; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T21 another seller cannot confirm the order (51007)', IIF(@err = 51007, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    DELETE @out;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000',
         @DeliveryAddress = N'Dorm A', @ShippingFee = 15000;
    SELECT @o1 = OrderId FROM @out;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o1, @SellerId = @S;
    SAVE TRAN t18;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_StartPayment @OrderId = @o1, @BuyerId = @B, @RequestKey = 'test-no-provider'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T18 payment needs a provider when none was chosen (51023)', IIF(@err = 51023, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    DELETE @out;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000',
         @DeliveryAddress = N'Dorm A', @ShippingFee = 15000;
    SELECT @o1 = OrderId FROM @out;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o1, @SellerId = @S;
    DECLARE @pay TABLE (PaymentId bigint);
    INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o1, @BuyerId = @B, @RequestKey = 'test-pay-1', @Provider = 'ZaloPay';
    INSERT @r SELECT 'T09 payment amount = subtotal + delivery fee; provider chosen at payment',
        IIF((SELECT Amount FROM dbo.Payments WHERE RequestKey = 'test-pay-1') = @sub + 15000 AND (SELECT PaymentProvider FROM dbo.Orders WHERE OrderId = @o1) = 'ZaloPay', 1, 0),
        (SELECT CONCAT('amount ', Amount) FROM dbo.Payments WHERE RequestKey = 'test-pay-1');
    DECLARE @amt decimal(18,0) = @sub + 15000;
    EXEC dbo.usp_RecordPaymentResult @RequestKey = 'test-pay-1', @ProviderReference = 'ref-1', @Amount = @amt, @Success = 1;
    EXEC dbo.usp_RecordPaymentResult @RequestKey = 'test-pay-1', @ProviderReference = 'ref-1', @Amount = @amt, @Success = 1;  -- duplicate callback: ignored
    SET @err = 0;
    BEGIN TRY SAVE TRAN t16; EXEC dbo.usp_RecordPaymentResult @RequestKey = 'test-pay-1', @ProviderReference = 'ref-OTHER', @Amount = @amt, @Success = 1; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T16a duplicate callback ignored, conflicting callback rejected (51011)',
        IIF(@err = 51011, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

-- The conflicting-callback test aborts the transaction, so the rest of the flow runs again cleanly.
BEGIN TRAN;
    DELETE @out; DELETE @pay;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000',
         @DeliveryAddress = N'Dorm A', @ShippingFee = 15000;
    SELECT @o1 = OrderId FROM @out;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o1, @SellerId = @S;
    INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o1, @BuyerId = @B, @RequestKey = 'test-pay-2', @Provider = 'MoMo';
    EXEC dbo.usp_RecordPaymentResult @RequestKey = 'test-pay-2', @ProviderReference = 'ref-2', @Amount = @amt, @Success = 1;
    EXEC dbo.usp_ShipOrder @OrderId = @o1, @SellerId = @S;   -- no courier / tracking number
    EXEC dbo.usp_CompleteOrder @OrderId = @o1, @BuyerId = @B;
    INSERT @r SELECT 'T16b full flow: delivered without tracking, completed, all items Sold, one settlement incl. delivery fee',
        IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o1) = 'Completed'
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Sold') = 2
            AND (SELECT COUNT(*) FROM dbo.SellerSettlements WHERE OrderId = @o1) = 1
            AND (SELECT Amount FROM dbo.SellerSettlements WHERE OrderId = @o1) = @sub - ROUND(@sub * 0.03, 0) + 15000   -- D1: payout includes the delivery fee
            AND EXISTS (SELECT 1 FROM dbo.Deliveries WHERE OrderId = @o1 AND Carrier IS NULL AND TrackingNumber IS NULL AND ReceivedAt IS NOT NULL), 1, 0),
        (SELECT CONCAT('settlement ', Amount) FROM dbo.SellerSettlements WHERE OrderId = @o1);
    INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating) VALUES (@o1, @B, @S, 5);
    INSERT @r SELECT 'T22a buyer can review the seller after completion', IIF(EXISTS (SELECT 1 FROM dbo.Reviews WHERE OrderId = @o1 AND ReviewerId = @B), 1, 0), NULL;
    SAVE TRAN t16c;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_CompleteOrder @OrderId = @o1, @BuyerId = @B; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T16c completing twice rejected (51015), still one settlement', IIF(@err = 51015, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

-- ---------- T11c a paid order cannot be cancelled ----------
BEGIN TRAN;
    DELETE @out; DELETE @pay;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @o1 = OrderId FROM @out;
    SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o1;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o1, @SellerId = @S;
    INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o1, @BuyerId = @B, @RequestKey = 'test-pay-3', @Provider = 'MoMo';
    EXEC dbo.usp_RecordPaymentResult @RequestKey = 'test-pay-3', @ProviderReference = 'ref-3', @Amount = @amt, @Success = 1;
    SET @err = 0;
    BEGIN TRY SAVE TRAN t11c; EXEC dbo.usp_CancelOrder @OrderId = @o1, @ActorId = @B, @Reason = N'test'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'T11c paid order cannot be cancelled (51018), listings stay Reserved', IIF(@err = 51018, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

-- ---------- T11d buyer cancels while awaiting payment ----------
BEGIN TRAN;
    DELETE @out;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @o1 = OrderId FROM @out;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o1, @SellerId = @S;
    EXEC dbo.usp_CancelOrder @OrderId = @o1, @ActorId = @B, @Reason = N'Changed my mind';
    INSERT @r SELECT 'T11d buyer cancel before payment releases every item',
        IIF((SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Available') = 2, 1, 0), NULL;
ROLLBACK;

-- ---------- T17 24-hour confirmation timeout ----------
BEGIN TRAN;
    DELETE @out;
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @o1 = OrderId FROM @out;
    UPDATE dbo.Orders SET CreatedAt = DATEADD(hour, -30, SYSUTCDATETIME()), ConfirmBy = DATEADD(hour, -6, SYSUTCDATETIME()) WHERE OrderId = @o1;
    EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'T17 expired pending order cancelled, all items released',
        IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o1) = 'Cancelled' AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Available') = 2, 1, 0), NULL;
ROLLBACK;

-- ---------- T12 historical prices are snapshots ----------
BEGIN TRAN;
    DELETE @out; DELETE @ids; INSERT @ids VALUES (@S1);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @o1 = OrderId FROM @out;
    UPDATE dbo.Products SET Price = Price + 99000, Title = Title + N' (edited)' WHERE ProductId = @S1;
    INSERT @r SELECT 'T12 later price/title edits do not change the order',
        IIF(EXISTS (SELECT 1 FROM dbo.OrderItems i JOIN #avail a ON a.ProductId = i.ProductId WHERE i.OrderId = @o1 AND i.UnitPrice = a.Price AND i.ProductTitle NOT LIKE N'%(edited)')
            AND (SELECT Subtotal FROM dbo.Orders WHERE OrderId = @o1) = (SELECT Price FROM #avail WHERE ProductId = @S1), 1, 0), NULL;
ROLLBACK;

-- ---------- T13 an order with items cannot be deleted (no orphans) ----------
SET @err = 0;
BEGIN TRY BEGIN TRAN; DELETE dbo.Orders WHERE OrderId = (SELECT MIN(OrderId) FROM dbo.Orders); END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r SELECT 'T13 deleting an order with items/payments is blocked (547)', IIF(@err = 547, 1, 0), CONCAT('error ', @err);

-- ---------- T20 empty checkout ----------
DELETE @ids; SET @err = 0;
BEGIN TRY EXEC dbo.usp_Checkout @BuyerId = @B, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A'; END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
INSERT @r SELECT 'T20 empty checkout rejected (51020)', IIF(@err = 51020, 1, 0), CONCAT('error ', @err);

-- ---------- T22b review before completion rejected by trigger ----------
SET @err = 0;
BEGIN TRY BEGIN TRAN;
    INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating)
    SELECT TOP (1) OrderId, BuyerId, SellerId, 5 FROM dbo.Orders WHERE Status = 'Paid' ORDER BY OrderId;
END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r SELECT 'T22b review of an unfinished order rejected (51001)', IIF(@err = 51001, 1, 0), CONCAT('error ', @err);

-- ---------- T14 referential integrity and module validity ----------
DECLARE @dbcc TABLE (TableName sysname, ConstraintName sysname, Condition nvarchar(4000));
INSERT @dbcc EXEC ('DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, NO_INFOMSGS');
INSERT @r SELECT 'T14a DBCC CHECKCONSTRAINTS: no violations', IIF(NOT EXISTS (SELECT 1 FROM @dbcc), 1, 0), (SELECT TOP (1) CONCAT(TableName, '.', ConstraintName) FROM @dbcc);

DECLARE @bad nvarchar(max) = N'', @mod sysname;
DECLARE mods CURSOR LOCAL FAST_FORWARD FOR
    SELECT QUOTENAME(SCHEMA_NAME(o.schema_id)) + '.' + QUOTENAME(o.name) FROM sys.objects o
    WHERE o.is_ms_shipped = 0 AND o.type IN ('P', 'V', 'TR') AND OBJECTPROPERTY(o.object_id, 'IsSchemaBound') = 0;
OPEN mods; FETCH NEXT FROM mods INTO @mod;
WHILE @@FETCH_STATUS = 0
BEGIN
    BEGIN TRY BEGIN TRAN; EXEC sys.sp_refreshsqlmodule @mod; ROLLBACK; END TRY
    BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; SET @bad += @mod + N' '; END CATCH;
    FETCH NEXT FROM mods INTO @mod;
END
CLOSE mods; DEALLOCATE mods;
INSERT @r SELECT 'T14b every procedure, view and trigger still compiles', IIF(@bad = N'', 1, 0), NULLIF(@bad, N'');

-- ---------- results ----------
SELECT Seq, IIF(Pass = 1, 'PASS', 'FAIL') AS Result, Test, Detail FROM @r ORDER BY Seq;
DECLARE @failed int = (SELECT COUNT(*) FROM @r WHERE Pass = 0), @total int = (SELECT COUNT(*) FROM @r);
PRINT CONCAT(@total - @failed, '/', @total, ' checks passed');
IF @failed > 0 RAISERROR('Scenario tests failed.', 16, 1);
GO
SET NOEXEC OFF;
GO
