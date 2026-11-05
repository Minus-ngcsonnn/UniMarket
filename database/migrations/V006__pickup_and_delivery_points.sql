/* =====================================================================
   V006 - GPS / map pickup point (listing) and delivery point (order)
   ---------------------------------------------------------------------
   Rollback: database/migrations/V006_rollback.sql

   What it does (additive; existing listings and orders keep NULL coordinates, nothing is invented):
     1. dbo.Products.PickupLatitude / PickupLongitude (decimal(9,6), both or neither) and PickupInstructions
        (nvarchar(300)): the seller-confirmed handover point. Never public; the backend shows it only to the seller
        and, after payment, to the buyer of an order (via the order snapshot below).
     2. dbo.OrderItems.PickupLatitude / PickupLongitude / PickupInstructions: SNAPSHOT per order item, copied from the
        listing when the item is inserted (trigger trg_OrderItems_PickupSnapshot), so a seller order with several
        listings keeps each listing's own pickup point and later listing edits never change an order.
     3. dbo.Orders.DeliveryLatitude / DeliveryLongitude: the buyer-confirmed delivery point, set inside the checkout
        transaction by trigger trg_Orders_DeliveryPoint from SESSION_CONTEXT values that the backend sets in the SAME
        batch as usp_CheckoutWithShipping (the V002 / V003 procedures are unchanged). A failed checkout rolls the
        points back together with the orders.
     4. trg_OrderLocations_Immutable (Orders) and trg_OrderItemLocations_Immutable (OrderItems): once stored, an order's
        delivery point and its items' pickup snapshots cannot be changed or cleared.
   Shipping zones, quotes, fees, commission and payouts are not touched.

   Run on an isolated copy first:
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V006__pickup_and_delivery_points.sql
            -v Approved="YES" TargetDb="<Db>" ProductionApproval="NO"
   TargetDb must equal the connected database. Running on UniMarketJava additionally needs ProductionApproval="YES".
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------- Step 0: guards and baseline ---------- */
IF '$(Approved)' <> 'YES'
BEGIN RAISERROR('V006: not approved. Pass -v Approved="YES" only after team approval.', 16, 1); SET NOEXEC ON; END
GO
IF DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V006: connected database does not match TargetDb; stopping.', 16, 1); SET NOEXEC ON; END
IF DB_NAME() = N'UniMarketJava' AND '$(ProductionApproval)' <> 'YES'
BEGIN RAISERROR('V006: UniMarketJava needs ProductionApproval="YES" (not given).', 16, 1); SET NOEXEC ON; END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V005')
BEGIN RAISERROR('V006: V005 must be applied first.', 16, 1); SET NOEXEC ON; END
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V006')
BEGIN RAISERROR('V006: already applied; it must not run twice.', 16, 1); SET NOEXEC ON; END
IF COL_LENGTH('dbo.Products', 'PickupLatitude') IS NOT NULL OR COL_LENGTH('dbo.Orders', 'DeliveryLatitude') IS NOT NULL
   OR COL_LENGTH('dbo.OrderItems', 'PickupLatitude') IS NOT NULL
BEGIN RAISERROR('V006: columns already exist; stop and investigate.', 16, 1); SET NOEXEC ON; END
GO

IF OBJECT_ID('tempdb..#V006Baseline') IS NOT NULL DROP TABLE #V006Baseline;
SELECT (SELECT COUNT(*) FROM dbo.Products) AS Products,
       (SELECT COUNT(*) FROM dbo.Orders) AS Orders,
       (SELECT COUNT(*) FROM dbo.OrderItems) AS OrderItems,
       (SELECT COALESCE(SUM(TotalAmount), 0) FROM dbo.Orders) AS OrderTotals,
       (SELECT CHECKSUM_AGG(CHECKSUM(ProductId, CategoryId, Title, Price, Status, ModerationStatus, PickupZoneId)) FROM dbo.Products) AS ProductsChecksum,
       (SELECT CHECKSUM_AGG(CHECKSUM(OrderId, BuyerId, SellerId, Status, ShippingFee, DeliveryAddress)) FROM dbo.Orders) AS OrdersChecksum
INTO #V006Baseline;

BEGIN TRANSACTION;
GO

/* ---------- Step 1: listing pickup point ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V006: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Products ADD
    PickupLatitude     decimal(9,6) NULL,
    PickupLongitude    decimal(9,6) NULL,
    PickupInstructions nvarchar(300) NULL;
GO
ALTER TABLE dbo.Products ADD
    CONSTRAINT CK_Products_PickupPoint CHECK ((PickupLatitude IS NULL AND PickupLongitude IS NULL)
        OR (PickupLatitude BETWEEN -90 AND 90 AND PickupLongitude BETWEEN -180 AND 180)),
    CONSTRAINT CK_Products_PickupInstructions CHECK (PickupInstructions IS NULL OR LEN(LTRIM(RTRIM(PickupInstructions))) > 0);
GO

/* ---------- Step 2: order snapshots ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V006: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.OrderItems ADD
    PickupLatitude     decimal(9,6) NULL,
    PickupLongitude    decimal(9,6) NULL,
    PickupInstructions nvarchar(300) NULL;
ALTER TABLE dbo.Orders ADD
    DeliveryLatitude  decimal(9,6) NULL,
    DeliveryLongitude decimal(9,6) NULL;
GO
ALTER TABLE dbo.OrderItems ADD CONSTRAINT CK_OrderItems_PickupPoint CHECK ((PickupLatitude IS NULL AND PickupLongitude IS NULL)
    OR (PickupLatitude BETWEEN -90 AND 90 AND PickupLongitude BETWEEN -180 AND 180));
ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_DeliveryPoint CHECK ((DeliveryLatitude IS NULL AND DeliveryLongitude IS NULL)
    OR (DeliveryLatitude BETWEEN -90 AND 90 AND DeliveryLongitude BETWEEN -180 AND 180));
GO

/* ---------- Step 3: snapshot triggers (run inside the checkout transaction) ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V006: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
CREATE TRIGGER dbo.trg_OrderItems_PickupSnapshot ON dbo.OrderItems AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    -- Each item keeps the pickup point its listing had when the order was placed.
    UPDATE oi SET PickupLatitude = p.PickupLatitude, PickupLongitude = p.PickupLongitude, PickupInstructions = p.PickupInstructions
    FROM dbo.OrderItems AS oi
    JOIN inserted AS i ON i.OrderItemId = oi.OrderItemId
    JOIN dbo.Products AS p ON p.ProductId = i.ProductId
    WHERE i.PickupLatitude IS NULL AND p.PickupLatitude IS NOT NULL;
END
GO
CREATE TRIGGER dbo.trg_Orders_DeliveryPoint ON dbo.Orders AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    -- Set by the backend in the same batch as usp_CheckoutWithShipping, for this buyer only.
    DECLARE @buyer int = TRY_CAST(SESSION_CONTEXT(N'unimarket.checkout.buyer') AS int),
            @lat decimal(9,6) = TRY_CAST(CAST(SESSION_CONTEXT(N'unimarket.checkout.deliveryLat') AS nvarchar(30)) AS decimal(9,6)),
            @lng decimal(9,6) = TRY_CAST(CAST(SESSION_CONTEXT(N'unimarket.checkout.deliveryLng') AS nvarchar(30)) AS decimal(9,6));
    IF @buyer IS NULL OR @lat IS NULL OR @lng IS NULL RETURN;
    UPDATE o SET DeliveryLatitude = @lat, DeliveryLongitude = @lng
    FROM dbo.Orders AS o
    JOIN inserted AS i ON i.OrderId = o.OrderId
    WHERE i.BuyerId = @buyer AND i.DeliveryLatitude IS NULL;
END
GO

/* ---------- Step 4: placed orders keep their points ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V006: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
CREATE TRIGGER dbo.trg_OrderLocations_Immutable ON dbo.Orders AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF (UPDATE(DeliveryLatitude) OR UPDATE(DeliveryLongitude)) AND EXISTS (
        SELECT 1 FROM deleted AS d JOIN inserted AS i ON i.OrderId = d.OrderId
        WHERE d.DeliveryLatitude IS NOT NULL
          AND (i.DeliveryLatitude IS NULL OR i.DeliveryLatitude <> d.DeliveryLatitude
               OR i.DeliveryLongitude IS NULL OR i.DeliveryLongitude <> d.DeliveryLongitude))
        THROW 51080, 'The delivery point of a placed order cannot be changed.', 1;
END
GO
CREATE TRIGGER dbo.trg_OrderItemLocations_Immutable ON dbo.OrderItems AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF (UPDATE(PickupLatitude) OR UPDATE(PickupLongitude) OR UPDATE(PickupInstructions)) AND EXISTS (
        SELECT 1 FROM deleted AS d JOIN inserted AS i ON i.OrderItemId = d.OrderItemId
        WHERE d.PickupLatitude IS NOT NULL
          AND (i.PickupLatitude IS NULL OR i.PickupLatitude <> d.PickupLatitude
               OR i.PickupLongitude IS NULL OR i.PickupLongitude <> d.PickupLongitude
               OR ISNULL(i.PickupInstructions, N'') <> ISNULL(d.PickupInstructions, N'')))
        THROW 51081, 'The pickup snapshot of a placed order cannot be changed.', 1;
END
GO

/* ---------- Step 5: record and verify ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V006: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
INSERT dbo.SchemaMigrations (Version, Description, AppliedAt, AppliedBy)
VALUES ('V006', N'GPS / map pickup point (Products) and delivery point (Orders) with per-item pickup snapshots (OrderItems)',
        SYSUTCDATETIME(), SUSER_SNAME());

DECLARE @problems nvarchar(max) = N'';
SELECT @problems = CONCAT(@problems,
    IIF(b.Products <> (SELECT COUNT(*) FROM dbo.Products), N'products; ', N''),
    IIF(b.Orders <> (SELECT COUNT(*) FROM dbo.Orders), N'orders; ', N''),
    IIF(b.OrderItems <> (SELECT COUNT(*) FROM dbo.OrderItems), N'order items; ', N''),
    IIF(b.OrderTotals <> (SELECT COALESCE(SUM(TotalAmount), 0) FROM dbo.Orders), N'order totals; ', N''),
    IIF(ISNULL(b.ProductsChecksum, 0) <> ISNULL((SELECT CHECKSUM_AGG(CHECKSUM(ProductId, CategoryId, Title, Price, Status, ModerationStatus, PickupZoneId)) FROM dbo.Products), 0), N'listing rows; ', N''),
    IIF(ISNULL(b.OrdersChecksum, 0) <> ISNULL((SELECT CHECKSUM_AGG(CHECKSUM(OrderId, BuyerId, SellerId, Status, ShippingFee, DeliveryAddress)) FROM dbo.Orders), 0), N'order rows; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Products WHERE PickupLatitude IS NOT NULL), N'unexpected pickup points; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Orders WHERE DeliveryLatitude IS NOT NULL), N'unexpected delivery points; ', N''))
FROM #V006Baseline AS b;
IF @problems <> N''
BEGIN
    RAISERROR(N'V006 post-checks FAILED (%s). Rolling back.', 16, 1, @problems);
    IF @@TRANCOUNT > 0 ROLLBACK;
    SET NOEXEC ON;
END
GO
IF @@TRANCOUNT = 1
BEGIN
    COMMIT;
    PRINT 'V006 applied and verified: pickup / delivery points and order snapshots added, existing rows unchanged.';
END
GO
SET NOEXEC OFF;
GO
