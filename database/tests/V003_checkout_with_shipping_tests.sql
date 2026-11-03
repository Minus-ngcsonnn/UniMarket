/* =====================================================================
   V003 SQL-level tests for dbo.usp_CheckoutWithShipping (isolated copies only).
   Proves: nested-transaction error propagation (incl. error 266), all-or-nothing rollback,
   per-seller fees, money columns, quote rows, result sets.
     sqlcmd -S <server> -E -C -I -d <TestDb> -i V003_checkout_with_shipping_tests.sql -v TargetDb="<TestDb>"
   ===================================================================== */
SET NOCOUNT ON;
IF DB_NAME() NOT LIKE N'%Test' OR DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('Run on an isolated *Test copy only.', 16, 1); SET NOEXEC ON; END
GO
-- Fixtures: one buyer, two sellers (one with a campus, one without), listings at different zones.
DECLARE @tag varchar(12) = LEFT(REPLACE(CONVERT(varchar(36), NEWID()), '-', ''), 12);
DECLARE @hash varchar(80) = '$2a$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyzABCDE';
INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, Role, Status, EmailVerifiedAt)
VALUES (CONCAT('sqlt-buyer-', @tag, '@gmail.com'), @hash, N'SQL Test Buyer', 1, 'Student', 'Active', SYSUTCDATETIME()),
       (CONCAT('sqlt-sellerA-', @tag, '@gmail.com'), @hash, N'SQL Test Seller A', 1, 'Student', 'Active', SYSUTCDATETIME());
INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, DeclaredUniversityName, Role, Status, EmailVerifiedAt)
VALUES (CONCAT('sqlt-sellerB-', @tag, '@gmail.com'), @hash, N'SQL Test Seller B', NULL, N'Đại học Cần Thơ', 'Student', 'Active', SYSUTCDATETIME());
DECLARE @buyer int = (SELECT UserId FROM dbo.Users WHERE Email = CONCAT('sqlt-buyer-', @tag, '@gmail.com'));
DECLARE @sellerA int = (SELECT UserId FROM dbo.Users WHERE Email = CONCAT('sqlt-sellerA-', @tag, '@gmail.com'));
DECLARE @sellerB int = (SELECT UserId FROM dbo.Users WHERE Email = CONCAT('sqlt-sellerB-', @tag, '@gmail.com'));
DECLARE @zoneHoaLac int = (SELECT ZoneId FROM dbo.LocationZones WHERE Code = 'HN-HOA-LAC');
DECLARE @zoneCauGiay int = (SELECT ZoneId FROM dbo.LocationZones WHERE Code = 'HN-CAU-GIAY');
INSERT dbo.Products (SellerId, CategoryId, CampusId, PickupZoneId, Title, Description, Condition, Price, Status, ModerationStatus) VALUES
 (@sellerA, 1, 1, NULL, N'SQLT A1', N'SQL level test listing A1', 'Used', 100000, 'Available', 'Approved'),
 (@sellerA, 1, 1, NULL, N'SQLT A2', N'SQL level test listing A2', 'Used', 333333, 'Available', 'Approved'),
 (@sellerB, 1, NULL, @zoneCauGiay, N'SQLT B1', N'SQL level test listing B1', 'Used', 50000, 'Available', 'Approved');
DECLARE @a1 int = (SELECT ProductId FROM dbo.Products WHERE Title = N'SQLT A1' AND SellerId = @sellerA);
DECLARE @a2 int = (SELECT ProductId FROM dbo.Products WHERE Title = N'SQLT A2' AND SellerId = @sellerA);
DECLARE @b1 int = (SELECT ProductId FROM dbo.Products WHERE Title = N'SQLT B1' AND SellerId = @sellerB);
DECLARE @reserved int = (SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = 'Reserved');
INSERT dbo.CartItems (UserId, ProductId) VALUES (@buyer, @a1), (@buyer, @b1);

DECLARE @ids dbo.ProductIdList, @ship dbo.SellerShippingList, @n int, @err int, @tc int, @msg nvarchar(4000);

PRINT '--- T1: a listing is already reserved -> V002 error 51021 surfaces; nothing created ---';
INSERT @ids VALUES (@a1), (@reserved);
INSERT @ship VALUES (@sellerA, 'STANDARD_SIM', @zoneHoaLac, 0.0, 0, 'SIM-2026-11');
BEGIN TRY
    EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zoneHoaLac,
         @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
    PRINT 'FAIL: no error';
END TRY
BEGIN CATCH
    SELECT @err = ERROR_NUMBER(), @tc = @@TRANCOUNT;
    PRINT CONCAT('caught error ', @err, ' (', ERROR_MESSAGE(), '); @@TRANCOUNT after = ', @tc);
END CATCH
SELECT @msg = CONCAT('T1 ', IIF(@err = 51021 AND @tc = 0
    AND NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE BuyerId = @buyer)
    AND (SELECT Status FROM dbo.Products WHERE ProductId = @a1) = 'Available', 'PASS', 'FAIL')); PRINT @msg;

PRINT '--- T2: one quote missing (seller B) -> 51062 AFTER usp_Checkout succeeded inside; everything rolled back ---';
DELETE @ids; DELETE @ship; SET @err = NULL;
INSERT @ids VALUES (@a1), (@b1);
INSERT @ship VALUES (@sellerA, 'STANDARD_SIM', @zoneHoaLac, 0.0, 0, 'SIM-2026-11');
BEGIN TRY
    EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zoneHoaLac,
         @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
END TRY
BEGIN CATCH SELECT @err = ERROR_NUMBER(), @tc = @@TRANCOUNT; END CATCH
SELECT @msg = CONCAT('T2 error ', @err, ' -> ', IIF(@err = 51062 AND @tc = 0
    AND NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE BuyerId = @buyer)
    AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@a1, @b1) AND Status = 'Available') = 2
    AND (SELECT COUNT(*) FROM dbo.CartItems WHERE UserId = @buyer) = 2, 'PASS', 'FAIL')); PRINT @msg;

PRINT '--- T3: pickup zone does not match seller B listing -> 51063, rolled back ---';
DELETE @ship; SET @err = NULL;
INSERT @ship VALUES (@sellerA, 'STANDARD_SIM', @zoneHoaLac, 0.0, 0, 'SIM-2026-11'),
                    (@sellerB, 'STANDARD_SIM', @zoneHoaLac, 36.0, 93000, 'SIM-2026-11');
BEGIN TRY
    EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zoneHoaLac,
         @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
END TRY
BEGIN CATCH SELECT @err = ERROR_NUMBER(), @tc = @@TRANCOUNT; END CATCH
SELECT @msg = CONCAT('T3 error ', @err, ' -> ', IIF(@err = 51063 AND NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE BuyerId = @buyer), 'PASS', 'FAIL')); PRINT @msg;

PRINT '--- T4: fee > 0 inside the free radius -> 51061 ---';
DELETE @ship; SET @err = NULL;
INSERT @ship VALUES (@sellerA, 'STANDARD_SIM', @zoneHoaLac, 2.5, 5000, 'SIM-2026-11'),
                    (@sellerB, 'STANDARD_SIM', @zoneCauGiay, 36.0, 93000, 'SIM-2026-11');
BEGIN TRY
    EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zoneHoaLac,
         @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
END TRY
BEGIN CATCH SELECT @err = ERROR_NUMBER(), @tc = @@TRANCOUNT; END CATCH
PRINT CONCAT('T4 error ', @err, ' -> ', IIF(@err = 51061, 'PASS', 'FAIL'));

PRINT '--- T5: success, two sellers with different fees; money columns and quotes ---';
DELETE @ids; DELETE @ship;
INSERT @ids VALUES (@a1), (@a2), (@b1);
INSERT @ship VALUES (@sellerA, 'STANDARD_SIM', @zoneHoaLac, 0.0, 0, 'SIM-2026-11'),            -- same zone: free
                    (@sellerB, 'GRAB_EXPRESS_SIM', @zoneCauGiay, 35.9, 180000, 'SIM-2026-11');   -- Cầu Giấy -> Hòa Lạc
DECLARE @results TABLE (OrderId bigint, SellerId int);
INSERT @results EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zoneHoaLac,
     @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
SELECT o.OrderId, o.SellerId, o.Subtotal, o.ShippingFee, o.TotalAmount, o.CommissionAmount, o.SellerProceeds, o.SellerPayoutTotal,
       q.Carrier, q.DistanceKm, q.Fee AS QuoteFee, DATEDIFF(hour, o.CreatedAt, o.ConfirmBy) AS ConfirmHours
FROM dbo.Orders o JOIN dbo.OrderShippingQuotes q ON q.OrderId = o.OrderId WHERE o.BuyerId = @buyer ORDER BY o.SellerId;
SELECT @msg = CONCAT('T5 result-set rows captured by INSERT-EXEC = ', (SELECT COUNT(*) FROM @results),
    ' (usp_Checkout set + final set: callers must read the LAST set)'); PRINT @msg;
SELECT @msg = CONCAT('T5 ', IIF(
    (SELECT ShippingFee FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerA) = 0
    AND (SELECT Subtotal FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerA) = 433333
    AND (SELECT CommissionAmount FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerA) = 13000
    AND (SELECT ShippingFee FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerB) = 180000
    AND (SELECT TotalAmount FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerB) = 230000
    AND (SELECT CommissionAmount FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerB) = 1500
    AND (SELECT SellerPayoutTotal FROM dbo.Orders WHERE BuyerId = @buyer AND SellerId = @sellerB) = 50000 - 1500 + 180000
    AND NOT EXISTS (SELECT 1 FROM dbo.Orders o JOIN dbo.OrderShippingQuotes q ON q.OrderId = o.OrderId WHERE o.BuyerId = @buyer AND q.Fee <> o.ShippingFee)
    AND (SELECT COUNT(*) FROM dbo.Products WHERE ProductId IN (@a1, @a2, @b1) AND Status = 'Reserved') = 3
    AND (SELECT COUNT(*) FROM dbo.CartItems WHERE UserId = @buyer) = 0, 'PASS', 'FAIL')); PRINT @msg;

PRINT '--- T6: same listings again -> refused (V002 duplicate protection) ---';
SET @err = NULL;
BEGIN TRY
    EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zoneHoaLac,
         @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
END TRY
BEGIN CATCH SELECT @err = ERROR_NUMBER(); END CATCH
SELECT @msg = CONCAT('T6 error ', @err, ' -> ', IIF(@err = 51021 AND (SELECT COUNT(*) FROM dbo.Orders WHERE BuyerId = @buyer) = 2, 'PASS', 'FAIL')); PRINT @msg;

PRINT '--- T7: CHECK constraints reject bad rows directly ---';
SET @err = NULL;
BEGIN TRY INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, Role) VALUES (CONCAT('sqlt-noaff-', @tag, '@gmail.com'), @hash, N'No affiliation', NULL, 'Student'); END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH
PRINT CONCAT('T7a user without campus or university -> ', IIF(@err = 547, 'PASS (547)', CONCAT('FAIL ', @err)));
SET @err = NULL;
BEGIN TRY INSERT dbo.Users (Email, PasswordHash, FullName, CampusId, DeclaredUniversityName, Role) VALUES (CONCAT('sqlt-blank-', @tag, '@gmail.com'), @hash, N'Blank', NULL, N'   ', 'Student'); END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH
PRINT CONCAT('T7b blank university name -> ', IIF(@err = 547, 'PASS (547)', CONCAT('FAIL ', @err)));
SET @err = NULL;
BEGIN TRY INSERT dbo.Products (SellerId, CategoryId, CampusId, PickupZoneId, Title, Description, Condition, Price, Status, ModerationStatus)
          VALUES (@sellerB, 1, NULL, NULL, N'No location', N'No location listing text', 'Used', 1000, 'Available', 'Pending'); END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH
PRINT CONCAT('T7c listing without campus or zone -> ', IIF(@err = 547, 'PASS (547)', CONCAT('FAIL ', @err)));
SET @err = NULL;
BEGIN TRY UPDATE dbo.OrderShippingQuotes SET DistanceKm = 2.0 WHERE Fee > 0; END TRY
BEGIN CATCH SET @err = ERROR_NUMBER(); END CATCH
PRINT CONCAT('T7d paid quote within 3 km -> ', IIF(@err = 547, 'PASS (547)', CONCAT('FAIL ', @err)));
GO

PRINT '--- T8: raw call without TRY/CATCH: which errors reach the client? (look for 266) ---';
DECLARE @ids dbo.ProductIdList, @ship dbo.SellerShippingList;
DECLARE @reserved int = (SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = 'Reserved');
DECLARE @buyer int = (SELECT TOP 1 UserId FROM dbo.Users WHERE Email LIKE 'sqlt-buyer-%' ORDER BY UserId DESC);
DECLARE @zone int = (SELECT ZoneId FROM dbo.LocationZones WHERE Code = 'HN-HOA-LAC');
INSERT @ids VALUES (@reserved);
INSERT @ship SELECT SellerId, 'STANDARD_SIM', @zone, 0.0, 0, 'SIM-2026-11' FROM dbo.Products WHERE ProductId = @reserved;
EXEC dbo.usp_CheckoutWithShipping @BuyerId = @buyer, @ProductIds = @ids, @Shipping = @ship, @DeliveryZoneId = @zone,
     @RecipientName = N'SQL Buyer', @RecipientPhone = '0912345678', @DeliveryAddress = N'Dorm A';
GO
PRINT CONCAT('after raw failure: @@TRANCOUNT = ', @@TRANCOUNT);
GO
