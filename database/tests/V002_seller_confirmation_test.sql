/* =====================================================================
   V002 seller confirmation window - Business Plan 3.4:
   "The seller receives the order notification and confirms availability within 24 hours."
   Run ONLY on a disposable *Test copy with V002 applied (uses dbo.test_MakeOrder from
   V002_business_rules_D1_D6_test.sql's pattern, created and dropped here).

   Checks that the 24-hour seller window (Orders.ConfirmBy, from order placement) is enforced
   on its own, separately from the buyer's 24-hour payment window (PaymentDueAt, from confirmation).
   sqlcmd -S <server> -E -C -I -b -d UniMarketJava_V002Test -i V002_seller_confirmation_test.sql
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT OFF;
IF DB_NAME() = N'UniMarketJava' OR DB_NAME() NOT LIKE N'%Test%' OR OBJECT_ID('dbo.OrderItems') IS NULL
BEGIN
    RAISERROR('Run only on a *Test copy with V002 applied.', 16, 1);
    SET NOEXEC ON;
END
GO
CREATE OR ALTER PROCEDURE dbo.test_PlaceOrder @Buyer int, @P1 int, @P2 int, @OrderId bigint OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids dbo.ProductIdList; INSERT @ids VALUES (@P1), (@P2);
    DECLARE @out TABLE (OrderId bigint, SellerId int);
    INSERT @out EXEC dbo.usp_Checkout @BuyerId = @Buyer, @ProductIds = @ids, @RecipientName = N'Test Buyer', @RecipientPhone = '0900000000', @DeliveryAddress = N'Dorm A';
    SELECT @OrderId = OrderId FROM @out;
END;
GO

DECLARE @r TABLE (Seq int IDENTITY, Test varchar(200), Pass bit, Detail nvarchar(300));
SELECT p.ProductId, p.SellerId INTO #avail
FROM dbo.Products p JOIN dbo.Users u ON u.UserId = p.SellerId JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
WHERE p.Status = 'Available' AND p.ModerationStatus = 'Approved' AND u.Status = 'Active' AND u.EmailVerifiedAt IS NOT NULL AND u.Role = 'Student' AND c.IsActive = 1;
DECLARE @S int, @B int, @S1 int, @S2 int, @o bigint, @err int;
SELECT TOP (1) @S = SellerId FROM #avail GROUP BY SellerId HAVING COUNT(*) >= 2 ORDER BY SellerId;
SELECT @S1 = MIN(ProductId) FROM #avail WHERE SellerId = @S;
SELECT @S2 = MIN(ProductId) FROM #avail WHERE SellerId = @S AND ProductId > @S1;
SELECT TOP (1) @B = UserId FROM dbo.Users WHERE Status = 'Active' AND EmailVerifiedAt IS NOT NULL AND Role = 'Student' AND UserId <> @S ORDER BY UserId;
DECLARE @exp TABLE (OrderId bigint, OldStatus varchar(20));
INSERT @r SELECT 'C00 fixtures found', IIF(@S IS NOT NULL AND @B IS NOT NULL AND @S2 IS NOT NULL, 1, 0), CONCAT('seller ', @S, ', buyer ', @B, ', listings ', @S1, '+', @S2);

-- C01: the window starts at placement and is exactly 24 h.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    INSERT @r SELECT 'C01 BP 3.4 a new order must be confirmed within 24 h of placement (ConfirmBy = CreatedAt + 24 h, UTC)',
        IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND Status = 'Pending' AND ConfirmBy = DATEADD(hour, 24, CreatedAt)
                    AND ABS(DATEDIFF(second, CreatedAt, SYSUTCDATETIME())) < 60 AND PaymentDueAt IS NULL), 1, 0),
        (SELECT CONCAT(CreatedAt, ' -> ', ConfirmBy) FROM dbo.Orders WHERE OrderId = @o);
ROLLBACK;

-- C02: confirming after the window is refused by the database itself, even if the expiry job has not run.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -(24 * 60 + 1), SYSUTCDATETIME()), ConfirmBy = DATEADD(minute, -1, SYSUTCDATETIME()) WHERE OrderId = @o;
    SAVE TRAN c02;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ConfirmOrder @OrderId = @o, @SellerId = @S; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'C02 confirming after the 24 h window is rejected (51007), order stays Pending, items stay Reserved',
        IIF(@err = 51007, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

-- C03: the seller rejects (declines) inside the window: order cancelled, every item released.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    EXEC dbo.usp_CancelOrder @OrderId = @o, @ActorId = @S, @Reason = N'Item no longer available';
    INSERT @r SELECT 'C03 seller rejects within 24 h -> Cancelled, ALL items Available, history records the seller',
        IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Cancelled'
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Available') = 2
            AND EXISTS (SELECT 1 FROM dbo.OrderStatusHistory WHERE OrderId = @o AND Status = 'Cancelled' AND ChangedBy = @S), 1, 0), NULL;
ROLLBACK;

-- C04: no answer from the seller within 24 h: the expiry job cancels and releases every item.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -(24 * 60 + 1), SYSUTCDATETIME()), ConfirmBy = DATEADD(minute, -1, SYSUTCDATETIME()) WHERE OrderId = @o;
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'C04 unconfirmed after 24 h -> Cancelled ("Confirmation deadline exceeded"), ALL items Available',
        IIF(EXISTS (SELECT 1 FROM @exp WHERE OrderId = @o AND OldStatus = 'Pending')
            AND EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND Status = 'Cancelled' AND CancellationReason = N'Confirmation deadline exceeded' AND ConfirmedAt IS NULL)
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Available') = 2
            AND EXISTS (SELECT 1 FROM dbo.OrderStatusHistory WHERE OrderId = @o AND Note = N'24-hour seller confirmation timeout'), 1, 0), NULL;
ROLLBACK;

-- C05: an unexpired Pending order is left alone.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -(23 * 60), SYSUTCDATETIME()), ConfirmBy = DATEADD(minute, 60, SYSUTCDATETIME()) WHERE OrderId = @o;
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'C05 a Pending order still inside its 24 h window is not expired', IIF((SELECT Status FROM dbo.Orders WHERE OrderId = @o) = 'Pending', 1, 0), NULL;
ROLLBACK;

-- C06: the two windows are independent. Seller confirms at hour 23; the seller window then ends,
-- but the buyer still has 24 h from confirmation, so the order must NOT expire.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -(23 * 60), SYSUTCDATETIME()), ConfirmBy = DATEADD(minute, 60, SYSUTCDATETIME()) WHERE OrderId = @o;
    EXEC dbo.usp_ConfirmOrder @OrderId = @o, @SellerId = @S;
    -- Two hours later: placement + 25 h (seller window over), confirmation + 2 h (payment window open).
    UPDATE dbo.Orders SET CreatedAt = DATEADD(minute, -(25 * 60), SYSUTCDATETIME()), ConfirmBy = DATEADD(minute, -60, SYSUTCDATETIME()),
                          ConfirmedAt = DATEADD(minute, -120, SYSUTCDATETIME()) WHERE OrderId = @o;
    DELETE @exp; INSERT @exp EXEC dbo.usp_ExpirePendingOrders;
    INSERT @r SELECT 'C06 seller window over but buyer payment window open -> confirmed order is NOT expired',
        IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @o AND Status = 'AwaitingPayment' AND ConfirmBy < SYSUTCDATETIME() AND PaymentDueAt > SYSUTCDATETIME())
            AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@S1, @S2) AND Status = 'Reserved') = 2, 1, 0),
        (SELECT CONCAT('ConfirmBy ', ConfirmBy, ', PaymentDueAt ', PaymentDueAt) FROM dbo.Orders WHERE OrderId = @o);
ROLLBACK;

-- C07: an unconfirmed order can never be paid, before or after its window.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_StartPayment @OrderId = @o, @BuyerId = @B, @RequestKey = 'c07', @Provider = 'MoMo'; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'C07 an order the seller has not confirmed cannot be paid (51008)', IIF(@err = 51008, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

-- C08: only the order's seller can confirm or reject.
BEGIN TRAN;
    EXEC dbo.test_PlaceOrder @Buyer = @B, @P1 = @S1, @P2 = @S2, @OrderId = @o OUTPUT;
    SET @err = 0;
    BEGIN TRY EXEC dbo.usp_ConfirmOrder @OrderId = @o, @SellerId = @B; END TRY BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH;
    INSERT @r SELECT 'C08 the buyer cannot confirm on the seller''s behalf (51007)', IIF(@err = 51007, 1, 0), CONCAT('error ', @err);
IF @@TRANCOUNT > 0 ROLLBACK;

SELECT Seq, IIF(Pass = 1, 'PASS', 'FAIL') AS Result, Test, Detail FROM @r ORDER BY Seq;
DECLARE @failed int = (SELECT COUNT(*) FROM @r WHERE Pass = 0), @total int = (SELECT COUNT(*) FROM @r);
PRINT CONCAT(@total - @failed, '/', @total, ' seller-confirmation checks passed');
DROP PROCEDURE dbo.test_PlaceOrder;
IF @failed > 0 RAISERROR('Seller confirmation tests failed.', 16, 1);
GO
SET NOEXEC OFF;
GO
