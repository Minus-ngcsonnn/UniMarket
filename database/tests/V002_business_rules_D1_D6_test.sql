/* =====================================================================
   V002 business rules D1-D6 - run ONLY on a disposable *Test copy that
   already has V002 applied. Refuses to run on UniMarketJava.

   D1 delivery fee paid by the buyer and passed to the seller (no commission on it)
   D2 24 hours to pay after the seller confirms
   D3 disputes / refunds recorded and decided manually by an admin
   D4 3 % commission on the merchandise subtotal, rounded to whole VND
   D5 buyer and seller review each other once per completed order
   D6 settlement calculated at completion; payout confirmed by an admin

   Each scenario runs in its own transaction that is rolled back (an expected
   error inside a trigger dooms the transaction, so scenarios never share one).
   Results live in a table variable. Exit code 1 (with -b) if any check fails.
   sqlcmd -S <server> -E -C -I -b -d UniMarketJava_V002Test -i V002_business_rules_D1_D6_test.sql
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT OFF;
IF DB_NAME() = N'UniMarketJava' OR DB_NAME() NOT LIKE N'%Test%' OR OBJECT_ID('dbo.OrderItems') IS NULL
BEGIN
    RAISERROR('Run only on a *Test copy with V002 applied.', 16, 1);
    SET NOEXEC ON;
END
GO
-- Helper (test database only, dropped at the end): builds an order for two listings of one seller and moves it to @Stage.
CREATE OR ALTER PROCEDURE dbo.test_MakeOrder
    @Buyer int, @P1 int, @P2 int, @Stage varchar(20), @Shipping decimal(18,0) = 0, @OrderId bigint OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES (@P1); IF @P2 IS NOT NULL INSERT @ids VALUES (@P2);
    DECLARE @out TABLE (OrderId bigint, SellerId int);
    DECLARE @pay TABLE (PaymentId bigint);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @Buyer, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000',
         @DeliveryAddress = N'Dorm A', @ShippingFee = @Shipping;
    DECLARE @seller int; SELECT @OrderId = OrderId, @seller = SellerId FROM @out;
    IF @Stage = 'Pending' RETURN;
    EXEC dbo.usp_ConfirmOrder @OrderId = @OrderId, @SellerId = @seller;
    IF @Stage = 'AwaitingPayment' RETURN;
    DECLARE @key varchar(100) = CONCAT('t-', @OrderId, '-', LEFT(NEWID(), 8)), @amt decimal(18,0) = (SELECT TotalAmount FROM dbo.Orders WHERE OrderId = @OrderId);
    INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @OrderId, @BuyerId = @Buyer, @RequestKey = @key, @Provider = 'MoMo';
    EXEC dbo.usp_RecordPaymentResult @RequestKey = @key, @ProviderReference = @key, @Amount = @amt, @Success = 1;
    IF @Stage = 'Paid' RETURN;
    EXEC dbo.usp_ShipOrder @OrderId = @OrderId, @SellerId = @seller;
    EXEC dbo.usp_CompleteOrder @OrderId = @OrderId, @BuyerId = @Buyer;
END;
GO

DECLARE @r TABLE (Seq int IDENTITY, Test varchar(200), Pass bit, Detail nvarchar(300));

-- ---------- fixtures ----------
SELECT p.ProductId, p.SellerId, p.Price
INTO #avail
FROM dbo.Products p JOIN dbo.Users u ON u.UserId = p.SellerId JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
WHERE p.Status = 'Available' AND p.ModerationStatus = 'Approved' AND u.Status = 'Active' AND u.EmailVerifiedAt IS NOT NULL
  AND u.Role = 'Student' AND c.IsActive = 1;
DECLARE @S int, @B int, @X int, @S1 int, @S2 int, @Admin int;
SELECT TOP (1) @S = SellerId FROM #avail GROUP BY SellerId HAVING COUNT(*) >= 2 ORDER BY SellerId;
SELECT @S1 = MIN(ProductId) FROM #avail WHERE SellerId = @S;
SELECT @S2 = MIN(ProductId) FROM #avail WHERE SellerId = @S AND ProductId > @S1;
SELECT TOP (1) @B = UserId FROM dbo.Users WHERE Status = 'Active' AND EmailVerifiedAt IS NOT NULL AND Role = 'Student' AND UserId <> @S ORDER BY UserId;
SELECT TOP (1) @X = UserId FROM dbo.Users WHERE Status = 'Active' AND EmailVerifiedAt IS NOT NULL AND Role = 'Student' AND UserId NOT IN (@S, @B) ORDER BY UserId;
SELECT TOP (1) @Admin = UserId FROM dbo.Users WHERE Role = 'Admin' AND Status = 'Active';
INSERT @r SELECT 'F00 fixtures found', IIF(@S IS NOT NULL AND @B IS NOT NULL AND @X IS NOT NULL AND @S2 IS NOT NULL AND @Admin IS NOT NULL, 1, 0),
    CONCAT('seller ', @S, ', buyer ', @B, ', other ', @X, ', admin ', @Admin, ', listings ', @S1, '+', @S2);

DECLARE @exp TABLE (OrderId bigint, OldStatus varchar(20));
DECLARE @pay TABLE (PaymentId bigint);
DECLARE @err int, @m int, @o bigint, @amt decimal(18,0), @d bigint;

/* ===================== D1 + D4 + D6: money ===================== */
BEGIN TRAN;
    UPDATE dbo.Products SET Price = 300000 WHERE ProductId = @S1;
    UPDATE dbo.Products SET Price = 200000 WHERE ProductId = @S2;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Pending', @Shipping = 25000, @OrderId = @o OUTPUT;
    INSERT @r SELECT 'F01 D1/D4 example: 500 000 + 25 000 -> total 525 000, commission 15 000, proceeds 485 000, payout 510 000',
        IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND Subtotal = 500000 AND ShippingFee = 25000 AND TotalAmount = 525000
                    AND CommissionAmount = 15000 AND SellerProceeds = 485000 AND SellerPayoutTotal = 510000), 1, 0),
        (SELECT CONCAT(Subtotal, ' / ', ShippingFee, ' / ', TotalAmount, ' / ', CommissionAmount, ' / ', SellerProceeds, ' / ', SellerPayoutTotal) FROM dbo.Orders WHERE OrderId = @o);
ROLLBACK;

BEGIN TRAN;
    UPDATE dbo.Products SET Price = 300000 WHERE ProductId = @S1;
    UPDATE dbo.Products SET Price = 200000 WHERE ProductId = @S2;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @Shipping = 25000, @OrderId = @o OUTPUT;
    INSERT @r SELECT 'F02 D1 the buyer was charged merchandise + delivery fee (525 000)',
        IIF((SELECT Amount FROM dbo.Payments WHERE OrderId = @o AND Status = 'Succeeded') = 525000, 1, 0),
        (SELECT CONCAT('payment ', Amount) FROM dbo.Payments WHERE OrderId = @o AND Status = 'Succeeded');
    INSERT @r SELECT 'F03 D1/D6 settlement 510 000 = 500 000 - 15 000 + 25 000, Pending = calculated, not paid',
        IIF(EXISTS (SELECT 1 FROM dbo.SellerSettlements WHERE OrderId = @o AND Amount = 510000 AND MerchandiseSubtotal = 500000
                    AND CommissionAmount = 15000 AND ShippingFee = 25000 AND Status = 'Pending' AND ReleasedAt IS NULL AND ReleasedBy IS NULL AND PayoutReference IS NULL), 1, 0),
        (SELECT CONCAT(Amount, ' = ', MerchandiseSubtotal, ' - ', CommissionAmount, ' + ', ShippingFee, ', ', Status) FROM dbo.SellerSettlements WHERE OrderId = @o);
    INSERT @r SELECT 'F04 D4 no commission on the delivery fee (15 000 = 3 % of 500 000, not of 525 000)',
        IIF((SELECT CommissionAmount FROM dbo.Orders WHERE OrderId = @o) = 15000 AND (SELECT CommissionAmount FROM dbo.SellerSettlements WHERE OrderId = @o) = 15000, 1, 0), NULL;
    UPDATE dbo.Products SET Price = 999000 WHERE ProductId IN (@S1, @S2);
    INSERT @r SELECT 'F05 D4 later price edits do not change items, order or settlement',
        IIF((SELECT SUM(UnitPrice) FROM dbo.OrderItems WHERE OrderId = @o) = 500000 AND (SELECT Subtotal FROM dbo.Orders WHERE OrderId = @o) = 500000
            AND (SELECT Amount FROM dbo.SellerSettlements WHERE OrderId = @o) = 510000, 1, 0), NULL;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_MarkSettlementReleased @OrderId = @o, @AdminId = @S, @PayoutReference = N'BANK-1'; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F07 D6 a non-admin cannot confirm a payout (51040)', IIF(@err = 51040, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @Shipping = 25000, @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY
        INSERT dbo.SellerSettlements (OrderId, SellerId, Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee)
        SELECT OrderId, SellerId, SellerPayoutTotal, Subtotal, CommissionAmount, ShippingFee FROM dbo.Orders WHERE OrderId = @o;
    END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F06 D6 a second settlement for the same order is rejected (2627)', IIF(@err = 2627, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @Shipping = 25000, @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY UPDATE dbo.SellerSettlements SET Status = 'Released', ReleasedAt = SYSUTCDATETIME() WHERE OrderId = @o; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F08 D6 marking a payout done without admin + reference is rejected (51045)', IIF(@err = 51045, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @Shipping = 25000, @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY UPDATE dbo.SellerSettlements SET Amount = Amount + 1, ShippingFee = ShippingFee + 1 WHERE OrderId = @o; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F09 D6 settlement amounts cannot be changed (51044)', IIF(@err = 51044, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @Shipping = 25000, @OrderId = @o OUTPUT;
    EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Item damaged on arrival';
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_MarkSettlementReleased @OrderId = @o, @AdminId = @Admin, @PayoutReference = N'BANK-1'; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F10 D3/D6 the payout is on hold while a dispute is open (51042)', IIF(@err = 51042, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @Shipping = 25000, @OrderId = @o OUTPUT;
    EXEC dbo.usp_MarkSettlementReleased @OrderId = @o, @AdminId = @Admin, @PayoutReference = N'  VCB-2026-11-02-001  ', @Note = N'Manual transfer';
    INSERT @r SELECT 'F11 D6 payout confirmation records admin, time, reference and an audit row',
        IIF(EXISTS (SELECT 1 FROM dbo.SellerSettlements WHERE OrderId = @o AND Status = 'Released' AND ReleasedBy = @Admin AND ReleasedAt IS NOT NULL
                    AND PayoutReference = N'VCB-2026-11-02-001' AND PayoutNote = N'Manual transfer')
            AND EXISTS (SELECT 1 FROM dbo.AdminActions WHERE AdminId = @Admin AND EntityType = 'SellerSettlement' AND EntityId = @o), 1, 0), NULL;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_MarkSettlementReleased @OrderId = @o, @AdminId = @Admin, @PayoutReference = N'VCB-2'; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F12 D6 a payout cannot be confirmed twice (51017)', IIF(@err = 51017, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_MarkSettlementReleased @OrderId = 4, @AdminId = @Admin, @PayoutReference = N'   '; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F13 D6 a payout reference is required (51041)', IIF(@err = 51041, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    SET @err = 0;
    BEGIN TRY
        INSERT dbo.SellerSettlements (OrderId, SellerId, Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee)
        SELECT TOP (1) OrderId, SellerId, SellerPayoutTotal, Subtotal, CommissionAmount, ShippingFee FROM dbo.Orders WHERE Status = 'Paid' ORDER BY OrderId;
    END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F14 D6 a settlement for an order that is not completed is rejected (51043)', IIF(@err = 51043, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    SET @err = 0;
    BEGIN TRY UPDATE dbo.SellerSettlements SET PayoutNote = N'edit' WHERE Status = 'Released'; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'F15 D6 a released settlement is final (51044)', IIF(@err = 51044, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    UPDATE dbo.Products SET Price = 333333 WHERE ProductId = @S1;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = NULL, @Stage = 'Pending', @OrderId = @o OUTPUT;
    INSERT @r SELECT 'F16 D4 rounding to whole VND: 333 333 -> commission 10 000 (9 999.99), proceeds 323 333',
        IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND CommissionAmount = 10000 AND SellerProceeds = 323333 AND SellerPayoutTotal = 323333), 1, 0),
        (SELECT CONCAT(CommissionAmount, ' / ', SellerProceeds) FROM dbo.Orders WHERE OrderId = @o);
ROLLBACK;

/* ===================== D2: 24-hour payment deadline ===================== */
BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Pending', @OrderId = @o OUTPUT;
    INSERT @r SELECT 'P01 D2 no payment deadline before the seller confirms', IIF((SELECT PaymentDueAt FROM dbo.Orders WHERE OrderId = @o) IS NULL, 1, 0), NULL;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o, @SellerId = @S;
    INSERT @r SELECT 'P02 D2 confirmation starts the 24 h deadline (PaymentDueAt = ConfirmedAt + 24 h, UTC)',
        IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND Status = 'AwaitingPayment' AND PaymentDueAt = DATEADD(hour, 24, ConfirmedAt)
                    AND ABS(DATEDIFF(second, ConfirmedAt, SYSUTCDATETIME())) < 60), 1, 0),
        (SELECT CONCAT(ConfirmedAt, ' -> ', PaymentDueAt) FROM dbo.Orders WHERE OrderId = @o);
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'P03 D2 an order inside its deadline is not expired', IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'AwaitingPayment', 1, 0), NULL;
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(hour, -25, SYSUTCDATETIME()) WHERE OrderId = @o;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'late-start', @Provider = 'MoMo'; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'P04 D2 no payment can be started after the deadline (51024)', IIF(@err = 51024, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(hour, -25, SYSUTCDATETIME()) WHERE OrderId = @o;
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'P05 D2 an unpaid order past the deadline expires and releases EVERY item',
        IIF(EXISTS (SELECT 1 FROM @exp WHERE OrderId = @o AND OldStatus = 'AwaitingPayment')
            AND EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND Status = 'Cancelled' AND CancellationReason = N'Payment deadline exceeded')
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Available') = 2
            AND EXISTS (SELECT 1 FROM dbo.OrderStatusHistory WHERE OrderId = @o AND Status = 'Cancelled' AND Note = N'24-hour payment timeout'), 1, 0), NULL;
ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(hour, -48, SYSUTCDATETIME()) WHERE OrderId = @o;
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'P06 D2 a paid order never expires; its items stay Reserved',
        IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Paid' AND NOT EXISTS (SELECT 1 FROM @exp WHERE OrderId = @o)
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Reserved') = 2, 1, 0), NULL;
ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o;
    DELETE @pay; INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'd2-inflight', @Provider = 'MoMo';
    -- Deadline passed 10 minutes ago (inside the 30-minute grace window); the attempt started 20 minutes ago, before it.
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(minute, -(24 * 60 + 10), SYSUTCDATETIME()) WHERE OrderId = @o;
    UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -20, SYSUTCDATETIME()) WHERE RequestKey = 'd2-inflight';
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'P07 D2 inside the grace window, an order with a payment in flight is not expired', IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'AwaitingPayment', 1, 0), NULL;
    EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-inflight', @ProviderReference = 'd2-inflight-ref', @Amount = @amt, @Success = 1, @Provider = 'MoMo';
    INSERT @r SELECT 'P08 D2 late success for an attempt started before the deadline is accepted (inside grace)', IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Paid', 1, 0), NULL;
    EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-inflight', @ProviderReference = 'd2-inflight-ref', @Amount = @amt, @Success = 1, @Provider = 'MoMo';
    INSERT @r SELECT 'P14 D2 an identical repeated success callback is ignored: still one successful payment',
        IIF((SELECT COUNT(*) FROM dbo.Payments WHERE OrderId = @o AND Status = 'Succeeded') = 1 AND (SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Paid', 1, 0), NULL;
ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o;
    DELETE @pay; INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'd2-silent', @Provider = 'MoMo';
    -- The provider never answered: deadline passed 60 minutes ago, beyond the 30-minute grace window.
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(minute, -(25 * 60), SYSUTCDATETIME()) WHERE OrderId = @o;
    UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -120, SYSUTCDATETIME()) WHERE RequestKey = 'd2-silent';
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'P10 D2 an unanswered attempt cannot block expiry forever: after grace the order expires, items released, attempt Expired',
        IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Cancelled'
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Available') = 2
            AND EXISTS (SELECT 1 FROM dbo.Payments WHERE RequestKey = 'd2-silent' AND Status = 'Expired' AND FinishedAt IS NOT NULL AND ProviderReference IS NULL), 1, 0), NULL;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-silent', @ProviderReference = 'd2-silent-ref', @Amount = @amt, @Success = 1; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'P11 D2 a success arriving for an Expired attempt is rejected (51026) for manual refund', IIF(@err = 51026, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o;
    DELETE @pay; INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'd2-toolate', @Provider = 'MoMo';
    -- Expiry job has not run yet, but the answer comes 60 minutes after the deadline.
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(minute, -(25 * 60), SYSUTCDATETIME()) WHERE OrderId = @o;
    UPDATE dbo.Payments SET CreatedAt = DATEADD(minute, -120, SYSUTCDATETIME()) WHERE RequestKey = 'd2-toolate';
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-toolate', @ProviderReference = 'd2-toolate-ref', @Amount = @amt, @Success = 1; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'P12 D2 a success arriving after the grace window is rejected (51026) even before the expiry job runs', IIF(@err = 51026, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o;
    DELETE @pay; INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'd2-mismatch', @Provider = 'MoMo';
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-mismatch', @ProviderReference = 'ref-x', @Amount = @amt, @Success = 1, @Provider = 'ZaloPay'; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    SET @m = 0;
    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRAN;
        EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
        SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o;
        DELETE @pay; INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'd2-mismatch', @Provider = 'MoMo';
    END
    DECLARE @wrong decimal(18,0) = @amt - 1;
    BEGIN TRY EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-mismatch', @ProviderReference = 'ref-x', @Amount = @wrong, @Success = 1; END TRY
    BEGIN CATCH SET @m = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'P13 D2 callback with another provider or a different amount is rejected (51010)', IIF(@err = 51010 AND @m = 51010, 1, 0), CONCAT('errors ', @err, ' / ', @m);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    SELECT @amt = TotalAmount FROM dbo.Orders WHERE OrderId = @o;
    DELETE @pay; INSERT @pay EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'd2-late', @Provider = 'MoMo';
    -- Make the attempt look as if it started after the deadline.
    UPDATE dbo.Orders SET ConfirmedAt = DATEADD(hour, -25, SYSUTCDATETIME()) WHERE OrderId = @o;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_RecordPaymentResult @RequestKey = 'd2-late', @ProviderReference = 'd2-late-ref', @Amount = @amt, @Success = 1; END TRY
    BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'P09 D2 success for an attempt started after the deadline is rejected (51025)', IIF(@err = 51025, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

/* ===================== D3: disputes and refunds (manual) ===================== */
BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'AwaitingPayment', @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Too early'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R01 D3 no dispute on an unpaid order (51030; it can simply be cancelled)', IIF(@err = 51030, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @X, @Reason = N'Not my order'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R02 D3 an unrelated user cannot open a dispute (51030)', IIF(@err = 51030, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_CancelOrder @OrderId = @o, @ActorId = @B, @Reason = N'Want my money back'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R03 D3 a paid order cannot be cancelled through the unpaid-order path (51018)', IIF(@err = 51018, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Seller stopped answering';
    SELECT @d = MAX(DisputeId) FROM dbo.OrderDisputes WHERE OrderId = @o;
    INSERT @r SELECT 'R04 D3 the buyer of a paid order opens a dispute; order, items and payment unchanged',
        IIF(EXISTS (SELECT 1 FROM dbo.OrderDisputes WHERE DisputeId = @d AND Status = 'Open' AND OpenedBy = @B)
            AND (SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Paid'
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Reserved') = 2
            AND (SELECT Status FROM dbo.Payments WHERE OrderId = @o) = 'Succeeded', 1, 0), CONCAT('dispute ', @d);
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @S, @Reason = N'Second one'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R05 D3 only one open dispute per order (51032)', IIF(@err = 51032, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Wrong item delivered';
    SELECT @d = MAX(DisputeId) FROM dbo.OrderDisputes WHERE OrderId = @o;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ResolveOrderDispute @DisputeId = @d, @AdminId = @S, @Decision = 'RefundApproved', @Resolution = N'x'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R06 D3 only an admin can decide a dispute (51034)', IIF(@err = 51034, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Wrong item delivered';
    SELECT @d = MAX(DisputeId) FROM dbo.OrderDisputes WHERE OrderId = @o;
    EXEC dbo.usp_ResolveOrderDispute @DisputeId = @d, @AdminId = @Admin, @Decision = 'RefundApproved', @Resolution = N'Photos confirm the wrong item.';
    INSERT @r SELECT 'R07 D3 RefundApproved is only a decision: no refund confirmed, order still Paid, items Reserved, audit row',
        IIF(EXISTS (SELECT 1 FROM dbo.OrderDisputes WHERE DisputeId = @d AND Status = 'Resolved' AND Decision = 'RefundApproved' AND ResolvedBy = @Admin
                    AND RefundConfirmedAt IS NULL AND RefundReference IS NULL)
            AND (SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Paid'
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Reserved') = 2
            AND (SELECT Status FROM dbo.Payments WHERE OrderId = @o) = 'Succeeded'
            AND EXISTS (SELECT 1 FROM dbo.AdminActions WHERE EntityType = 'OrderDispute' AND EntityId = @d), 1, 0), NULL;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ConfirmDisputeRefund @DisputeId = @d, @AdminId = @Admin, @RefundReference = N' '; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R08 D3 a refund cannot be marked done without a refund reference (51037)', IIF(@err = 51037, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Wrong item delivered';
    SELECT @d = MAX(DisputeId) FROM dbo.OrderDisputes WHERE OrderId = @o;
    EXEC dbo.usp_ResolveOrderDispute @DisputeId = @d, @AdminId = @Admin, @Decision = 'RefundApproved', @Resolution = N'Approved.';
    EXEC dbo.usp_ConfirmDisputeRefund @DisputeId = @d, @AdminId = @Admin, @RefundReference = N'MOMO-REFUND-778';
    INSERT @r SELECT 'R09 D3 a refund is recorded as done only with the admin''s external reference',
        IIF(EXISTS (SELECT 1 FROM dbo.OrderDisputes WHERE DisputeId = @d AND RefundReference = N'MOMO-REFUND-778' AND RefundConfirmedBy = @Admin AND RefundConfirmedAt IS NOT NULL), 1, 0), NULL;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ConfirmDisputeRefund @DisputeId = @d, @AdminId = @Admin, @RefundReference = N'AGAIN'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R10 D3 a refund cannot be confirmed twice (51038)', IIF(@err = 51038, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    EXEC dbo.usp_OpenOrderDispute @OrderId = @o, @UserId = @B, @Reason = N'Wrong item delivered';
    SELECT @d = MAX(DisputeId) FROM dbo.OrderDisputes WHERE OrderId = @o;
    EXEC dbo.usp_ResolveOrderDispute @DisputeId = @d, @AdminId = @Admin, @Decision = 'NoRefund', @Resolution = N'Item matches the listing.';
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ConfirmDisputeRefund @DisputeId = @d, @AdminId = @Admin, @RefundReference = N'REF'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R11 D3 no refund can be confirmed when the decision was NoRefund (51038)', IIF(@err = 51038, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    SET @err = 0;
    BEGIN TRY
        INSERT dbo.OrderDisputes (OrderId, OpenedBy, Reason, Status, Decision, Resolution, ResolvedBy, ResolvedAt, RefundReference, RefundConfirmedBy, RefundConfirmedAt)
        SELECT TOP (1) OrderId, BuyerId, N'x', 'Resolved', 'NoRefund', N'x', @Admin, SYSUTCDATETIME(), N'REF', @Admin, SYSUTCDATETIME() FROM dbo.Orders WHERE Status = 'Paid';
    END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'R12 D3 a confirmed refund without an approved refund is impossible even by direct SQL (547)', IIF(@err = 547, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

/* ===================== D5: reviews per completed order ===================== */
BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Paid', @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating) VALUES (@o, @B, @S, 5); END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'V01 D5 no review before the order is completed (51001)', IIF(@err = 51001, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @OrderId = @o OUTPUT;
    INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating, Comment) VALUES (@o, @B, @S, 5, N'Great seller');
    INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating) VALUES (@o, @S, @B, 4);
    INSERT @r SELECT 'V02 D5 buyer reviews seller AND seller reviews buyer for the completed order (one review per order, not per item)',
        IIF((SELECT COUNT(*) FROM dbo.Reviews WHERE OrderId = @o) = 2 AND (SELECT COUNT(*) FROM dbo.OrderItems WHERE OrderId = @o) = 2, 1, 0), NULL;
    SET @err = 0;
    BEGIN TRY INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating) VALUES (@o, @B, @S, 1); END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'V03 D5 a second review in the same direction is rejected (2627)', IIF(@err = 2627, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

BEGIN TRAN;
    EXEC dbo.test_MakeOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @Stage = 'Completed', @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY INSERT dbo.Reviews (OrderId, ReviewerId, RevieweeId, Rating) VALUES (@o, @X, @S, 1); END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'V04 D5 an unrelated user cannot review (51001)', IIF(@err = 51001, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

/* ===================== Existing demo data ===================== */
INSERT @r SELECT 'E01 the 4 demo settlements keep their V001 amounts (merchandise proceeds; delivery fee recorded as 0 = not paid out)',
    IIF(NOT EXISTS (SELECT 1 FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId
                    WHERE s.OrderId <= 12 AND (s.Amount <> o.SellerProceeds OR s.ShippingFee <> 0 OR s.MerchandiseSubtotal <> o.Subtotal))
        AND (SELECT COUNT(*) FROM dbo.SellerSettlements WHERE OrderId <= 12) = 4
        AND (SELECT COUNT(*) FROM dbo.SellerSettlements WHERE OrderId <= 12 AND Status = 'Released' AND ReleasedBy IS NULL) = 3, 1, 0), NULL;
INSERT @r SELECT 'E02 demo AwaitingPayment orders have PaymentDueAt = ConfirmedAt + 24 h',
    IIF(NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId <= 12 AND Status = 'AwaitingPayment' AND (PaymentDueAt IS NULL OR PaymentDueAt <> DATEADD(hour, 24, ConfirmedAt))), 1, 0), NULL;

-- ---------- results ----------
SELECT Seq, IIF(Pass = 1, 'PASS', 'FAIL') AS Result, Test, Detail FROM @r ORDER BY Seq;
DECLARE @failed int = (SELECT COUNT(*) FROM @r WHERE Pass = 0), @total int = (SELECT COUNT(*) FROM @r);
PRINT CONCAT(@total - @failed, '/', @total, ' D1-D6 checks passed');
DROP PROCEDURE dbo.test_MakeOrder;
IF @failed > 0 RAISERROR('D1-D6 tests failed.', 16, 1);
GO
SET NOEXEC OFF;
GO
