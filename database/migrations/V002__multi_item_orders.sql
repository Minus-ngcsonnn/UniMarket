/* =====================================================================
   UniMarket - Migration V002: multi-item orders (Orders + OrderItems)
   Target : SQL Server 2019+ database created by baseline V001
            (UniMarket_BusinessAligned.sql).
   Model  : one order = one buyer + one seller + one or more listings
            from that seller. One checkout creates one order per seller,
            all-or-nothing.
   Rules  : D1 delivery fee paid by buyer, passed to seller, no commission on it;
            D2 24 h to pay after the seller confirms (30-minute grace for in-flight payments); D3 disputes/refunds decided
            manually by an admin; D4 3 % commission on the merchandise subtotal;
            D5 buyer and seller review each other per completed order (V001 trigger);
            D6 settlement calculated at completion, payout confirmed by an admin.

   HOW TO RUN (only after the review gate and a verified backup):
     SSMS : Query > SQLCMD Mode ON, select the target database, run the
            ENTIRE file.
     sqlcmd: sqlcmd -S <server> -E -C -I -b -d <database> -i V002__multi_item_orders.sql
            (-I = QUOTED_IDENTIFIER ON, required for the indexed view)

   SAFETY
   - Refuses to run if the schema is not exactly baseline V001
     (Orders.ProductId present, OrderItems absent).
   - Everything happens in ONE transaction with XACT_ABORT ON. Each step
     records itself in #V002Steps; the last batch compares the migrated
     data with a snapshot taken at the start and COMMITs only if every
     step ran and every check passes. Otherwise it rolls back.
   - If any batch fails, later batches are skipped (SET NOEXEC ON), and
     an open transaction is rolled back when the session ends.
   - No order, payment, delivery, settlement, review or history row is
     deleted. Existing OrderIds are kept.
   ===================================================================== */
:ON ERROR EXIT
:setvar V002SqlCmdMode "ON"
SET NOCOUNT ON;
SET XACT_ABORT ON;
-- Session options required for indexed views and filtered indexes.
SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
GO

/* ---------- Step 0: preconditions (no changes yet) ---------- */
-- Without SQLCMD mode, ":ON ERROR EXIT" is ignored and $(V002SqlCmdMode) is not replaced.
-- Old-model columns are only read through dynamic SQL, so this batch also compiles
-- (and refuses cleanly) on a database that is already migrated.
DECLARE @stop nvarchar(300), @n int;
IF '$(V002SqlCmdMode)' <> 'ON'
    SET @stop = N'V002: run this script in SQLCMD mode (SSMS: Query > SQLCMD Mode) or with sqlcmd.';
ELSE IF SESSIONPROPERTY('QUOTED_IDENTIFIER') <> 1 OR SESSIONPROPERTY('ANSI_NULLS') <> 1 OR SESSIONPROPERTY('ARITHABORT') <> 1
    SET @stop = N'V002: required session options are OFF (QUOTED_IDENTIFIER / ANSI_NULLS / ARITHABORT).';
ELSE IF COL_LENGTH('dbo.Orders', 'ProductId') IS NULL OR OBJECT_ID('dbo.OrderItems', 'U') IS NOT NULL
    SET @stop = N'V002: schema is not baseline V001 (already migrated or unexpected).';
ELSE
BEGIN
    EXEC sys.sp_executesql N'SELECT @n = COUNT(*) FROM dbo.Orders o JOIN dbo.Products p ON p.ProductId = o.ProductId WHERE p.SellerId <> o.SellerId',
        N'@n int OUTPUT', @n OUTPUT;
    IF @n > 0
        SET @stop = N'V002: an order''s seller differs from its product''s seller. Fix the data first.';
    ELSE IF EXISTS (SELECT 1 FROM dbo.Payments WHERE Status = 'Pending')
        SET @stop = N'V002: a payment attempt is still Pending. Resolve gateway results first.';
END
IF @stop IS NOT NULL
BEGIN
    SET @stop += N' Nothing was changed.';
    RAISERROR(@stop, 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------- Step 1: start the transaction and snapshot the data ---------- */
BEGIN TRANSACTION;

CREATE TABLE #V002Steps (Step varchar(40) PRIMARY KEY);

-- Per-order snapshot used to prove that nothing changed in meaning.
SELECT o.OrderId, o.ProductId, o.ProductTitle, o.ItemPrice, o.BuyerId, o.SellerId, o.ShippingFee,
       o.TotalAmount, o.CommissionAmount, o.SellerProceeds, o.PaymentProvider, o.Status,
       o.CreatedAt, o.ConfirmBy, o.ConfirmedAt, o.PaidAt, o.ShippedAt, o.CompletedAt, o.CancelledAt,
       o.RecipientName, o.RecipientPhone, o.DeliveryAddress, o.CancellationReason
INTO #V002Orders
FROM dbo.Orders o;

-- Row counts and checksums of every other table, to prove they were not touched.
SELECT t.name AS TableName, SUM(p.rows) AS RowCnt
INTO #V002Counts
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name NOT IN ('Orders')
GROUP BY t.name;

SELECT
    (SELECT CHECKSUM_AGG(CHECKSUM(PaymentId, OrderId, Provider, RequestKey, ProviderReference, Amount, Status, IsSandbox, CreatedAt, FinishedAt)) FROM dbo.Payments) AS Payments,
    (SELECT CHECKSUM_AGG(CHECKSUM(OrderId, SellerId, Amount, Status, IsSandbox, CreatedAt, ReleasedAt)) FROM dbo.SellerSettlements) AS Settlements,
    (SELECT CHECKSUM_AGG(CHECKSUM(ReviewId, OrderId, ReviewerId, RevieweeId, Rating, Comment, IsHidden, CreatedAt)) FROM dbo.Reviews) AS Reviews,
    (SELECT CHECKSUM_AGG(CHECKSUM(HistoryId, OrderId, Status, ChangedBy, Note, ChangedAt)) FROM dbo.OrderStatusHistory) AS History,
    (SELECT CHECKSUM_AGG(CHECKSUM(OrderId, Carrier, TrackingNumber, ShippedAt, ReceivedAt)) FROM dbo.Deliveries) AS Deliveries,
    (SELECT CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, Title, Price, Status, ModerationStatus, UpdatedAt)) FROM dbo.Products) AS Products
INTO #V002Checksums;

INSERT #V002Steps VALUES ('1-snapshot');
GO

/* ---------- Step 2: new table OrderItems + Orders.Subtotal ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
CREATE TABLE dbo.SchemaMigrations (
    Version     varchar(20)   NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
    Description nvarchar(200) NOT NULL,
    AppliedAt   datetime2(0)  NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME(),
    AppliedBy   nvarchar(128) NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedBy DEFAULT SUSER_SNAME());

-- One purchased listing inside an order. Second-hand listings are unique items,
-- so Quantity is always 1; it exists only to keep line totals explicit.
CREATE TABLE dbo.OrderItems (
    OrderItemId  bigint IDENTITY CONSTRAINT PK_OrderItems PRIMARY KEY,
    OrderId      bigint        NOT NULL,
    SellerId     int           NOT NULL,   -- copy of the order's seller, enforced by FK below
    ProductId    int           NOT NULL,
    ProductTitle nvarchar(200) NOT NULL,   -- snapshot at purchase time
    UnitPrice    decimal(18,0) NOT NULL CONSTRAINT CK_OrderItems_UnitPrice CHECK (UnitPrice > 0),  -- snapshot, VND
    Quantity     int           NOT NULL CONSTRAINT DF_OrderItems_Quantity DEFAULT 1
                                        CONSTRAINT CK_OrderItems_Quantity CHECK (Quantity = 1),
    CreatedAt    datetime2(0)  NOT NULL CONSTRAINT DF_OrderItems_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_OrderItems_Order_Product UNIQUE (OrderId, ProductId));

ALTER TABLE dbo.Orders ADD Subtotal decimal(18,0) NULL;   -- sum of item prices, VND

-- Composite keys that let foreign keys prove "item seller = order seller = product seller".
ALTER TABLE dbo.Orders   ADD CONSTRAINT UQ_Orders_Order_Seller     UNIQUE (OrderId, SellerId);
ALTER TABLE dbo.Products ADD CONSTRAINT UQ_Products_Product_Seller UNIQUE (ProductId, SellerId);

INSERT #V002Steps VALUES ('2-create');
GO

/* ---------- Step 3: copy every existing order into one order item ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
UPDATE dbo.Orders SET Subtotal = ItemPrice;

INSERT dbo.OrderItems (OrderId, SellerId, ProductId, ProductTitle, UnitPrice, Quantity, CreatedAt)
SELECT OrderId, SellerId, ProductId, ProductTitle, ItemPrice, 1, CreatedAt
FROM dbo.Orders
ORDER BY OrderId;

ALTER TABLE dbo.OrderItems ADD
    CONSTRAINT FK_OrderItems_Order   FOREIGN KEY (OrderId, SellerId)   REFERENCES dbo.Orders (OrderId, SellerId),
    CONSTRAINT FK_OrderItems_Product FOREIGN KEY (ProductId, SellerId) REFERENCES dbo.Products (ProductId, SellerId);
CREATE INDEX IX_OrderItems_Product ON dbo.OrderItems (ProductId);

INSERT #V002Steps VALUES ('3-copy');
GO

/* ---------- Step 4: remove the single-product columns from Orders ----------
   TotalAmount / CommissionAmount / SellerProceeds are computed from ItemPrice,
   so they are dropped and re-created from Subtotal (same values, verified in
   step 9). The CHECK on ItemPrice, the FK to Products and UX_ProductOccupied
   are replaced by OrderItems constraints and the indexed view in step 6.     */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'ALTER TABLE dbo.Orders DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
WHERE fk.parent_object_id = OBJECT_ID('dbo.Orders') AND fkc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Orders'), 'ProductId', 'ColumnId');
SELECT @sql += N'ALTER TABLE dbo.Orders DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('dbo.Orders') AND cc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Orders'), 'ItemPrice', 'ColumnId');
EXEC sys.sp_executesql @sql;

DROP INDEX UX_ProductOccupied ON dbo.Orders;
ALTER TABLE dbo.Orders DROP COLUMN TotalAmount, CommissionAmount, SellerProceeds;
ALTER TABLE dbo.Orders DROP COLUMN ProductId, ProductTitle, ItemPrice;

INSERT #V002Steps VALUES ('4-drop-old');
GO

/* ---------- Step 5: order totals, payment timing, optional delivery details ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Orders ALTER COLUMN Subtotal decimal(18,0) NOT NULL;
ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Subtotal CHECK (Subtotal > 0);

-- Same formulas as V001, now on the merchandise subtotal. Commission (3 %) is
-- charged on the subtotal only, never on the delivery fee.
ALTER TABLE dbo.Orders ADD
    TotalAmount      AS CONVERT(decimal(18,0), Subtotal + ShippingFee) PERSISTED,
    CommissionAmount AS CONVERT(decimal(18,0), ROUND(Subtotal * CommissionRate, 0)) PERSISTED,
    SellerProceeds   AS CONVERT(decimal(18,0), Subtotal - ROUND(Subtotal * CommissionRate, 0)) PERSISTED;

-- Business Plan 6.6: Place Order -> Seller Confirmation -> Website Checkout -> Payment.
-- The provider is chosen when paying, so it may be empty until then.
ALTER TABLE dbo.Orders ALTER COLUMN PaymentProvider varchar(10) NULL;
ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_ProviderWhenPaid
    CHECK (PaymentProvider IS NOT NULL OR Status IN ('Pending', 'AwaitingPayment', 'Cancelled'));

-- Sellers arrange delivery themselves (Business Plan: no platform delivery service),
-- so a courier name and tracking number are optional.
ALTER TABLE dbo.Deliveries ALTER COLUMN Carrier nvarchar(100) NULL;
ALTER TABLE dbo.Deliveries ALTER COLUMN TrackingNumber varchar(100) NULL;

-- D2: a payment attempt the provider never answered is closed as 'Expired' by
-- usp_ExpirePendingOrders after a 30-minute grace window (not a provider result).
DECLARE @ck nvarchar(max) = N'';
SELECT @ck += N'ALTER TABLE dbo.Payments DROP CONSTRAINT ' + QUOTENAME(name) + N';'
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('dbo.Payments') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Payments'), 'Status', 'ColumnId');
EXEC sys.sp_executesql @ck;
ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_Status CHECK (Status IN ('Pending', 'Failed', 'Succeeded', 'Expired'));

-- D2: the buyer has 24 hours from the seller's confirmation to pay. Derived from
-- ConfirmedAt (UTC), so it cannot drift from the confirmation time.
ALTER TABLE dbo.Orders ADD PaymentDueAt AS DATEADD(hour, 24, ConfirmedAt) PERSISTED;

-- D1: the seller receives merchandise proceeds plus the full delivery fee.
-- SellerProceeds stays "merchandise only"; SellerPayoutTotal is what the seller is owed.
ALTER TABLE dbo.Orders ADD SellerPayoutTotal AS
    CONVERT(decimal(18,0), Subtotal - ROUND(Subtotal * CommissionRate, 0) + ShippingFee) PERSISTED;

-- D1/D4/D6: each settlement keeps its own breakdown and the admin's payout confirmation.
ALTER TABLE dbo.SellerSettlements ADD
    MerchandiseSubtotal decimal(18,0) NULL,
    CommissionAmount    decimal(18,0) NULL,
    ShippingFee         decimal(18,0) NULL,
    ReleasedBy          int           NULL CONSTRAINT FK_SellerSettlements_ReleasedBy REFERENCES dbo.Users (UserId),
    PayoutReference     nvarchar(100) NULL,   -- reference of the manual transfer, entered by the admin
    PayoutNote          nvarchar(500) NULL;

-- D3: refund / dispute requests on paid orders, decided manually by an admin.
-- Approval and confirmed refund are separate facts: RefundConfirmedAt is only set
-- when an admin records the reference of a refund that really happened.
CREATE TABLE dbo.OrderDisputes (
    DisputeId         bigint IDENTITY CONSTRAINT PK_OrderDisputes PRIMARY KEY,
    OrderId           bigint         NOT NULL CONSTRAINT FK_OrderDisputes_Order REFERENCES dbo.Orders (OrderId),
    OpenedBy          int            NOT NULL CONSTRAINT FK_OrderDisputes_OpenedBy REFERENCES dbo.Users (UserId),
    Reason            nvarchar(2000) NOT NULL CONSTRAINT CK_OrderDisputes_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) > 0),
    Status            varchar(10)    NOT NULL CONSTRAINT DF_OrderDisputes_Status DEFAULT 'Open'
                                              CONSTRAINT CK_OrderDisputes_Status CHECK (Status IN ('Open', 'Resolved')),
    Decision          varchar(20)    NULL     CONSTRAINT CK_OrderDisputes_Decision CHECK (Decision IN ('NoRefund', 'RefundApproved')),
    Resolution        nvarchar(2000) NULL,
    ResolvedBy        int            NULL     CONSTRAINT FK_OrderDisputes_ResolvedBy REFERENCES dbo.Users (UserId),
    ResolvedAt        datetime2(0)   NULL,
    RefundReference   nvarchar(100)  NULL,
    RefundConfirmedBy int            NULL     CONSTRAINT FK_OrderDisputes_RefundConfirmedBy REFERENCES dbo.Users (UserId),
    RefundConfirmedAt datetime2(0)   NULL,
    CreatedAt         datetime2(0)   NOT NULL CONSTRAINT DF_OrderDisputes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_OrderDisputes_Resolved CHECK (
        (Status = 'Open' AND Decision IS NULL AND ResolvedBy IS NULL AND ResolvedAt IS NULL)
     OR (Status = 'Resolved' AND Decision IS NOT NULL AND ResolvedBy IS NOT NULL AND ResolvedAt IS NOT NULL)),
    CONSTRAINT CK_OrderDisputes_RefundConfirmed CHECK (
        (RefundReference IS NULL AND RefundConfirmedBy IS NULL AND RefundConfirmedAt IS NULL)
     OR (Decision = 'RefundApproved' AND RefundReference IS NOT NULL AND RefundConfirmedBy IS NOT NULL AND RefundConfirmedAt IS NOT NULL)));
CREATE UNIQUE INDEX UX_OrderDisputes_OneOpen ON dbo.OrderDisputes (OrderId) WHERE Status = 'Open';

INSERT #V002Steps VALUES ('5-orders');
GO

/* ---------- Step 5b: settlement breakdown for existing rows ----------
   The 4 demo settlements were calculated by V001 (merchandise proceeds only, no
   delivery fee). Approved decision: they keep their original financial treatment
   and are NOT recalculated (order 4 stays 92 150 VND): Amount, Status and dates stay
   exactly as recorded. Orders completed after V002 follow D1. Their breakdown is filled in truthfully: subtotal and commission
   from the order, ShippingFee = 0 because V001 did not pay the delivery fee out.  */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
UPDATE s SET MerchandiseSubtotal = o.Subtotal, CommissionAmount = o.CommissionAmount, ShippingFee = 0
FROM dbo.SellerSettlements AS s JOIN dbo.Orders AS o ON o.OrderId = s.OrderId;

ALTER TABLE dbo.SellerSettlements ALTER COLUMN MerchandiseSubtotal decimal(18,0) NOT NULL;
ALTER TABLE dbo.SellerSettlements ALTER COLUMN CommissionAmount decimal(18,0) NOT NULL;
ALTER TABLE dbo.SellerSettlements ALTER COLUMN ShippingFee decimal(18,0) NOT NULL;
ALTER TABLE dbo.SellerSettlements ADD
    CONSTRAINT CK_SellerSettlements_Commission CHECK (CommissionAmount = ROUND(MerchandiseSubtotal * 0.03, 0)),
    CONSTRAINT CK_SellerSettlements_Shipping   CHECK (ShippingFee >= 0),
    CONSTRAINT CK_SellerSettlements_Amount     CHECK (Amount = MerchandiseSubtotal - CommissionAmount + ShippingFee);

INSERT #V002Steps VALUES ('5b-settlements');
GO

/* ---------- Step 6: one listing can be in at most one non-cancelled order ----------
   Replaces UX_ProductOccupied. Enforced by the database itself, so even two
   simultaneous checkouts cannot sell the same item twice.                     */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
CREATE VIEW dbo.vw_ActiveOrderItems
WITH SCHEMABINDING
AS
SELECT oi.ProductId, oi.OrderId, oi.OrderItemId
FROM dbo.OrderItems AS oi
JOIN dbo.Orders AS o ON o.OrderId = oi.OrderId
WHERE o.Status <> 'Cancelled';
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
CREATE UNIQUE CLUSTERED INDEX UX_ActiveOrderItems_Product ON dbo.vw_ActiveOrderItems (ProductId);
CREATE TYPE dbo.ProductIdList AS TABLE (ProductId int NOT NULL PRIMARY KEY);
DROP PROCEDURE dbo.usp_PlaceOrder;   -- replaced by usp_Checkout (whole checkout, all sellers)
INSERT #V002Steps VALUES ('6-guard');
GO

/* ---------- Step 7: procedures ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002: whole checkout. Groups the listings by seller and creates one order per
-- seller with its items, reserving every listing. All-or-nothing: if any listing
-- is unavailable, belongs to the buyer or fails a check, nothing is created.
-- Concurrency: listing rows are read with UPDLOCK/HOLDLOCK, so a second checkout
-- of the same listing waits, then sees it Reserved and fails; the unique index on
-- vw_ActiveOrderItems is the final guard. A deadlock victim (error 1205) may retry.
-- Returns one row per created order: OrderId, SellerId.
CREATE PROCEDURE dbo.usp_Checkout
    @BuyerId int,
    @ProductIds dbo.ProductIdList READONLY,
    @RecipientName nvarchar(150),
    @RecipientPhone varchar(20),
    @DeliveryAddress nvarchar(500),
    @PaymentProvider varchar(10) = NULL,
    @ShippingFee decimal(18,0) = 0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @BuyerId AND Status = 'Active' AND EmailVerifiedAt IS NOT NULL)
            THROW 51004, 'An active verified buyer is required.', 1;
        IF NULLIF(LTRIM(RTRIM(@RecipientName)), N'') IS NULL OR NULLIF(LTRIM(RTRIM(@RecipientPhone)), '') IS NULL
           OR NULLIF(LTRIM(RTRIM(@DeliveryAddress)), N'') IS NULL
            THROW 51005, 'Delivery information is required.', 1;
        IF NOT EXISTS (SELECT 1 FROM @ProductIds)
            THROW 51020, 'Select at least one listing.', 1;

        DECLARE @Items TABLE (ProductId int PRIMARY KEY, SellerId int NOT NULL, Title nvarchar(200) NOT NULL, Price decimal(18,0) NOT NULL);
        INSERT @Items (ProductId, SellerId, Title, Price)
        SELECT p.ProductId, p.SellerId, p.Title, p.Price
        FROM dbo.Products AS p WITH (UPDLOCK, HOLDLOCK)
        JOIN @ProductIds AS r ON r.ProductId = p.ProductId
        WHERE p.Status = 'Available' AND p.ModerationStatus = 'Approved'
          AND EXISTS (SELECT 1 FROM dbo.Users u WHERE u.UserId = p.SellerId AND u.Status = 'Active' AND u.EmailVerifiedAt IS NOT NULL)
          AND EXISTS (SELECT 1 FROM dbo.Categories c WHERE c.CategoryId = p.CategoryId AND c.IsActive = 1);

        IF EXISTS (SELECT 1 FROM @Items WHERE SellerId = @BuyerId)
            THROW 51022, 'You cannot buy your own listing.', 1;
        IF (SELECT COUNT(*) FROM @Items) <> (SELECT COUNT(*) FROM @ProductIds)
            THROW 51021, 'One or more listings are no longer available.', 1;

        DECLARE @Created TABLE (OrderId bigint PRIMARY KEY, SellerId int NOT NULL UNIQUE);
        DECLARE @Seller int = (SELECT MIN(SellerId) FROM @Items);
        WHILE @Seller IS NOT NULL
        BEGIN
            INSERT dbo.Orders (BuyerId, SellerId, Subtotal, ShippingFee, RecipientName, RecipientPhone, DeliveryAddress, PaymentProvider)
            OUTPUT inserted.OrderId, inserted.SellerId INTO @Created (OrderId, SellerId)
            SELECT @BuyerId, @Seller, SUM(Price), @ShippingFee, @RecipientName, @RecipientPhone, @DeliveryAddress, @PaymentProvider
            FROM @Items WHERE SellerId = @Seller;
            SET @Seller = (SELECT MIN(SellerId) FROM @Items WHERE SellerId > @Seller);
        END;

        INSERT dbo.OrderItems (OrderId, SellerId, ProductId, ProductTitle, UnitPrice, Quantity)
        SELECT c.OrderId, i.SellerId, i.ProductId, i.Title, i.Price, 1
        FROM @Items AS i JOIN @Created AS c ON c.SellerId = i.SellerId;

        UPDATE p SET Status = 'Reserved', UpdatedAt = SYSUTCDATETIME()
        FROM dbo.Products AS p JOIN @Items AS i ON i.ProductId = p.ProductId;

        DELETE ci FROM dbo.CartItems AS ci JOIN @Items AS i ON i.ProductId = ci.ProductId WHERE ci.UserId = @BuyerId;

        INSERT dbo.OrderStatusHistory (OrderId, Status, ChangedBy)
        SELECT OrderId, 'Pending', @BuyerId FROM @Created;

        COMMIT;
        SELECT OrderId, SellerId FROM @Created ORDER BY SellerId;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002: the buyer may choose the provider now (Business Plan 6.6). @Provider is
-- optional for callers that set it at checkout. Amount = order TotalAmount
-- (merchandise + delivery fee). D2: no new attempt after PaymentDueAt.
CREATE OR ALTER PROCEDURE dbo.usp_StartPayment
    @OrderId bigint, @BuyerId int, @RequestKey varchar(100), @IsSandbox bit = 1, @Provider varchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        DECLARE @Amount decimal(18,0), @Chosen varchar(10), @DueAt datetime2(0);
        SELECT @Amount = TotalAmount, @Chosen = COALESCE(@Provider, PaymentProvider), @DueAt = PaymentDueAt
        FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
        WHERE OrderId = @OrderId AND BuyerId = @BuyerId AND Status = 'AwaitingPayment';
        IF @Amount IS NULL THROW 51008, 'Payment requires the buyer of an awaiting-payment order.', 1;
        IF SYSUTCDATETIME() >= @DueAt THROW 51024, 'The 24-hour payment deadline has passed.', 1;
        IF @Chosen IS NULL THROW 51023, 'Choose a payment provider.', 1;
        UPDATE dbo.Orders SET PaymentProvider = @Chosen WHERE OrderId = @OrderId;
        INSERT dbo.Payments (OrderId, Provider, RequestKey, Amount, IsSandbox) VALUES (@OrderId, @Chosen, @RequestKey, @Amount, @IsSandbox);
        DECLARE @Id bigint = SCOPE_IDENTITY(); COMMIT; SELECT @Id AS PaymentId;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002: courier and tracking number are optional (seller-arranged delivery).
CREATE OR ALTER PROCEDURE dbo.usp_ShipOrder
    @OrderId bigint, @SellerId int, @Carrier nvarchar(100) = NULL, @TrackingNumber varchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        UPDATE dbo.Orders WITH (UPDLOCK) SET Status = 'Delivering', ShippedAt = SYSUTCDATETIME()
        WHERE OrderId = @OrderId AND SellerId = @SellerId AND Status = 'Paid';
        IF @@ROWCOUNT <> 1 THROW 51014, 'Only seller may ship a paid order.', 1;
        INSERT dbo.Deliveries (OrderId, Carrier, TrackingNumber, ShippedAt)
        VALUES (@OrderId, NULLIF(LTRIM(RTRIM(@Carrier)), N''), NULLIF(LTRIM(RTRIM(@TrackingNumber)), ''), SYSUTCDATETIME());
        INSERT dbo.OrderStatusHistory (OrderId, Status, ChangedBy) VALUES (@OrderId, 'Delivering', @SellerId);
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002: completing an order marks EVERY listing in it Sold and creates one
-- settlement for the whole order (PK on SellerSettlements.OrderId prevents duplicates).
-- D1/D4: settlement = subtotal - 3 % commission + delivery fee, with its breakdown.
-- The settlement is only CALCULATED here (Pending); the payout is confirmed later
-- by an admin (usp_MarkSettlementReleased).
CREATE OR ALTER PROCEDURE dbo.usp_CompleteOrder @OrderId bigint, @BuyerId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        DECLARE @SellerId int, @Amount decimal(18,0), @Sandbox bit, @Subtotal decimal(18,0), @Commission decimal(18,0), @Shipping decimal(18,0);
        SELECT @SellerId = SellerId, @Amount = SellerPayoutTotal, @Subtotal = Subtotal, @Commission = CommissionAmount, @Shipping = ShippingFee
        FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE OrderId = @OrderId AND BuyerId = @BuyerId AND Status = 'Delivering';
        IF @SellerId IS NULL THROW 51015, 'Only buyer may confirm receipt of a delivering order.', 1;
        SELECT @Sandbox = IsSandbox FROM dbo.Payments WHERE OrderId = @OrderId AND Status = 'Succeeded';
        IF @Sandbox IS NULL THROW 51016, 'Successful payment is required.', 1;
        UPDATE dbo.Orders SET Status = 'Completed', CompletedAt = SYSUTCDATETIME() WHERE OrderId = @OrderId;
        UPDATE dbo.Deliveries SET ReceivedAt = SYSUTCDATETIME() WHERE OrderId = @OrderId;
        UPDATE p SET Status = 'Sold', UpdatedAt = SYSUTCDATETIME()
        FROM dbo.Products AS p JOIN dbo.OrderItems AS oi ON oi.ProductId = p.ProductId WHERE oi.OrderId = @OrderId;
        INSERT dbo.SellerSettlements (OrderId, SellerId, Amount, MerchandiseSubtotal, CommissionAmount, ShippingFee, IsSandbox)
        VALUES (@OrderId, @SellerId, @Amount, @Subtotal, @Commission, @Shipping, @Sandbox);
        INSERT dbo.OrderStatusHistory (OrderId, Status, ChangedBy) VALUES (@OrderId, 'Completed', @BuyerId);
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002: cancelling (buyer cancel, seller decline, admin) before payment releases
-- EVERY reserved listing of the order. Paid orders cannot be cancelled here:
-- refunds/disputes need a separate, approved workflow.
CREATE OR ALTER PROCEDURE dbo.usp_CancelOrder @OrderId bigint, @ActorId int, @Reason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
                       WHERE OrderId = @OrderId AND Status IN ('Pending', 'AwaitingPayment')
                         AND (@ActorId IN (BuyerId, SellerId)
                              OR EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @ActorId AND Role = 'Admin' AND Status = 'Active')))
            THROW 51018, 'Only participants/admin may cancel an unpaid order.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Payments WHERE OrderId = @OrderId AND Status = 'Pending')
            THROW 51019, 'Resolve pending gateway attempt before cancellation.', 1;
        UPDATE dbo.Orders SET Status = 'Cancelled', CancelledAt = SYSUTCDATETIME(), CancellationReason = @Reason WHERE OrderId = @OrderId;
        UPDATE p SET Status = 'Available', UpdatedAt = SYSUTCDATETIME()
        FROM dbo.Products AS p JOIN dbo.OrderItems AS oi ON oi.ProductId = p.ProductId
        WHERE oi.OrderId = @OrderId AND p.Status = 'Reserved';
        INSERT dbo.OrderStatusHistory (OrderId, Status, ChangedBy, Note) VALUES (@OrderId, 'Cancelled', @ActorId, @Reason);
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002: expires orders and releases ALL their listings (schedule from Java, e.g. every minute):
--   Pending         + ConfirmBy passed    -> seller did not confirm within 24 h
--   AwaitingPayment + PaymentDueAt passed -> buyer did not pay within 24 h of confirmation (D2)
-- Paid / Delivering / Completed orders are never touched.
-- In-flight payments: an order whose payment attempt is still 'Pending' gets a grace
-- window of 30 minutes after PaymentDueAt for the provider to answer. After that the
-- order expires anyway and the unanswered attempt is marked 'Expired' (UniMarket stopped
-- waiting; it is NOT a provider result). A later success for it is rejected (51026) and
-- must be refunded manually (D3). So a silent provider can never block expiry forever.
-- Concurrency: candidate order rows are locked FIRST (UPDLOCK, HOLDLOCK), payments after;
-- usp_RecordPaymentResult and usp_StartPayment lock the same order row first, so the
-- two sides are serialized and never see a half-done state.
CREATE OR ALTER PROCEDURE dbo.usp_ExpirePendingOrders
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        DECLARE @Now datetime2(0) = SYSUTCDATETIME();
        DECLARE @Candidates TABLE (OrderId bigint PRIMARY KEY, OldStatus varchar(20) NOT NULL);
        INSERT @Candidates (OrderId, OldStatus)
        SELECT OrderId, Status FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
        WHERE (Status = 'Pending' AND ConfirmBy <= @Now)
           OR (Status = 'AwaitingPayment' AND PaymentDueAt <= @Now);
        -- Still inside the 30-minute grace window with an attempt in flight: wait for the provider.
        DELETE c FROM @Candidates AS c JOIN dbo.Orders AS o ON o.OrderId = c.OrderId
        WHERE c.OldStatus = 'AwaitingPayment' AND @Now < DATEADD(minute, 30, o.PaymentDueAt)
          AND EXISTS (SELECT 1 FROM dbo.Payments AS p WHERE p.OrderId = c.OrderId AND p.Status = 'Pending');
        -- Beyond the grace window: stop waiting for unanswered attempts.
        UPDATE p SET Status = 'Expired', FinishedAt = @Now
        FROM dbo.Payments AS p WITH (UPDLOCK) JOIN @Candidates AS c ON c.OrderId = p.OrderId
        WHERE p.Status = 'Pending';

        UPDATE o SET Status = 'Cancelled', CancelledAt = @Now,
            CancellationReason = IIF(c.OldStatus = 'Pending', N'Confirmation deadline exceeded', N'Payment deadline exceeded')
        FROM dbo.Orders AS o JOIN @Candidates AS c ON c.OrderId = o.OrderId AND o.Status = c.OldStatus;
        UPDATE p SET Status = 'Available', UpdatedAt = @Now
        FROM dbo.Products AS p JOIN dbo.OrderItems AS oi ON oi.ProductId = p.ProductId JOIN @Candidates AS c ON c.OrderId = oi.OrderId
        WHERE p.Status = 'Reserved';
        INSERT dbo.OrderStatusHistory (OrderId, Status, Note)
        SELECT OrderId, 'Cancelled', IIF(OldStatus = 'Pending', N'24-hour seller confirmation timeout', N'24-hour payment timeout') FROM @Candidates;
        COMMIT;
        SELECT OrderId, OldStatus FROM @Candidates ORDER BY OrderId;   -- the expired orders
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002 (D2): records a payment result. ONLY trusted backend code may call it, AFTER it has
-- authenticated the callback (provider signature) - the database cannot check signatures.
-- The database then checks, with the order row locked first:
--   * the attempt exists (request key), belongs to this order, and @Provider (if given) matches it;
--   * the amount equals the order total and a provider reference is present
--     (UX_PaymentReference: one reference per provider; UX_SuccessfulPayment: one success per order);
--   * a repeated identical callback is ignored; a conflicting one is rejected (51011);
--   * late-callback rule (approved): a SUCCESS is accepted after PaymentDueAt only if the attempt
--     was started before PaymentDueAt (51025 otherwise) AND it arrives within the 30-minute grace
--     window; after that, or for an attempt already marked 'Expired', it is rejected (51026) and
--     the charge must be refunded manually (D3).
CREATE OR ALTER PROCEDURE dbo.usp_RecordPaymentResult
    @RequestKey varchar(100), @ProviderReference varchar(150), @Amount decimal(18,0), @Success bit, @Provider varchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        DECLARE @OrderId bigint, @Status varchar(20), @PaymentStatus varchar(10), @Expected decimal(18,0), @ExistingRef varchar(150),
                @DueAt datetime2(0), @AttemptAt datetime2(0), @AttemptProvider varchar(10);
        SELECT @OrderId = OrderId FROM dbo.Payments WHERE RequestKey = @RequestKey;
        IF @OrderId IS NULL THROW 51009, 'Unknown payment request.', 1;
        SELECT @Status = Status, @Expected = TotalAmount, @DueAt = PaymentDueAt FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE OrderId = @OrderId;
        SELECT @PaymentStatus = Status, @ExistingRef = ProviderReference, @AttemptAt = CreatedAt, @AttemptProvider = Provider
        FROM dbo.Payments WITH (UPDLOCK, HOLDLOCK) WHERE RequestKey = @RequestKey;
        IF @Amount <> @Expected OR NULLIF(@ProviderReference, '') IS NULL OR (@Provider IS NOT NULL AND @Provider <> @AttemptProvider)
            THROW 51010, 'Payment amount/reference/provider mismatch.', 1;
        IF @PaymentStatus = 'Expired'
            THROW 51026, 'The payment attempt had expired; if the buyer was charged, refund manually.', 1;
        IF @PaymentStatus <> 'Pending'
        BEGIN
            IF @ExistingRef = @ProviderReference AND ((@PaymentStatus = 'Succeeded' AND @Success = 1) OR (@PaymentStatus = 'Failed' AND @Success = 0))
            BEGIN COMMIT; RETURN; END;
            THROW 51011, 'Conflicting duplicate callback.', 1;
        END;
        IF @Status <> 'AwaitingPayment' THROW 51012, 'Order is not awaiting payment.', 1;
        IF @Success = 1 AND @AttemptAt >= @DueAt THROW 51025, 'This payment attempt started after the payment deadline.', 1;
        IF @Success = 1 AND SYSUTCDATETIME() >= DATEADD(minute, 30, @DueAt)
            THROW 51026, 'The payment result arrived after the 30-minute grace window; if the buyer was charged, refund manually.', 1;
        UPDATE dbo.Payments SET Status = CASE WHEN @Success = 1 THEN 'Succeeded' ELSE 'Failed' END,
            ProviderReference = @ProviderReference, FinishedAt = SYSUTCDATETIME() WHERE RequestKey = @RequestKey;
        IF @Success = 1
        BEGIN
            UPDATE dbo.Orders SET Status = 'Paid', PaidAt = SYSUTCDATETIME() WHERE OrderId = @OrderId;
            INSERT dbo.OrderStatusHistory (OrderId, Status, Note) VALUES (@OrderId, 'Paid', N'Verified online payment result');
        END;
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002 (D6): an ADMIN confirms that the seller was paid, with the reference of the
-- manual transfer. This records the confirmation; it does not move money.
-- Refused while the order has an open dispute or an approved refund (D3).
CREATE OR ALTER PROCEDURE dbo.usp_MarkSettlementReleased
    @OrderId bigint, @AdminId int, @PayoutReference nvarchar(100), @Note nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AdminId AND Role = 'Admin' AND Status = 'Active')
            THROW 51040, 'Only an active admin can confirm a payout.', 1;
        IF NULLIF(LTRIM(RTRIM(@PayoutReference)), N'') IS NULL
            THROW 51041, 'Enter the reference of the payout transfer.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.SellerSettlements WITH (UPDLOCK, HOLDLOCK) WHERE OrderId = @OrderId AND Status = 'Pending')
            THROW 51017, 'Settlement not pending.', 1;
        IF EXISTS (SELECT 1 FROM dbo.OrderDisputes WITH (UPDLOCK, HOLDLOCK)
                   WHERE OrderId = @OrderId AND (Status = 'Open' OR Decision = 'RefundApproved'))
            THROW 51042, 'The order has an open dispute or an approved refund; the payout is on hold.', 1;
        UPDATE dbo.SellerSettlements
        SET Status = 'Released', ReleasedAt = SYSUTCDATETIME(), ReleasedBy = @AdminId,
            PayoutReference = LTRIM(RTRIM(@PayoutReference)), PayoutNote = @Note
        WHERE OrderId = @OrderId AND Status = 'Pending';
        INSERT dbo.AdminActions (AdminId, Action, EntityType, EntityId, Reason)
        VALUES (@AdminId, N'Confirm seller payout', 'SellerSettlement', @OrderId, CONCAT(N'Reference: ', LTRIM(RTRIM(@PayoutReference)), IIF(@Note IS NULL, N'', N'. ' + @Note)));
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002 (D3): the buyer or seller of a PAID order (Paid, Delivering, Completed) opens
-- a dispute / refund request. Nothing else changes: order, listings, payment and
-- settlement stay as they are; the settlement payout is put on hold.
CREATE OR ALTER PROCEDURE dbo.usp_OpenOrderDispute @OrderId bigint, @UserId int, @Reason nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
                       WHERE OrderId = @OrderId AND @UserId IN (BuyerId, SellerId) AND Status IN ('Paid', 'Delivering', 'Completed'))
            THROW 51030, 'Only the buyer or seller of a paid order can open a dispute.', 1;
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 51031, 'Describe the problem.', 1;
        IF EXISTS (SELECT 1 FROM dbo.OrderDisputes WHERE OrderId = @OrderId AND Status = 'Open')
            THROW 51032, 'This order already has an open dispute.', 1;
        IF EXISTS (SELECT 1 FROM dbo.SellerSettlements WHERE OrderId = @OrderId AND Status = 'Released')
            THROW 51033, 'The seller has already been paid for this order; contact support.', 1;
        INSERT dbo.OrderDisputes (OrderId, OpenedBy, Reason) VALUES (@OrderId, @UserId, LTRIM(RTRIM(@Reason)));
        DECLARE @Id bigint = SCOPE_IDENTITY();
        INSERT dbo.OrderStatusHistory (OrderId, Status, ChangedBy, Note)
        SELECT OrderId, Status, @UserId, N'Dispute opened' FROM dbo.Orders WHERE OrderId = @OrderId;
        COMMIT; SELECT @Id AS DisputeId;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002 (D3): an admin records the decision. 'RefundApproved' is a DECISION only; it
-- does not refund anything and does not change the order, listings or payment.
CREATE OR ALTER PROCEDURE dbo.usp_ResolveOrderDispute
    @DisputeId bigint, @AdminId int, @Decision varchar(20), @Resolution nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AdminId AND Role = 'Admin' AND Status = 'Active')
            THROW 51034, 'Only an active admin can resolve a dispute.', 1;
        IF @Decision NOT IN ('NoRefund', 'RefundApproved') OR NULLIF(LTRIM(RTRIM(@Resolution)), N'') IS NULL
            THROW 51035, 'Choose NoRefund or RefundApproved and explain the decision.', 1;
        UPDATE dbo.OrderDisputes WITH (UPDLOCK)
        SET Status = 'Resolved', Decision = @Decision, Resolution = LTRIM(RTRIM(@Resolution)), ResolvedBy = @AdminId, ResolvedAt = SYSUTCDATETIME()
        WHERE DisputeId = @DisputeId AND Status = 'Open';
        IF @@ROWCOUNT <> 1 THROW 51036, 'Dispute not found or already resolved.', 1;
        INSERT dbo.AdminActions (AdminId, Action, EntityType, EntityId, Reason)
        VALUES (@AdminId, CONCAT(N'Resolve dispute: ', @Decision), 'OrderDispute', @DisputeId, LTRIM(RTRIM(@Resolution)));
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002 (D3): an admin records that an approved refund REALLY happened outside
-- UniMarket's automation (provider dashboard or manual transfer), with its reference.
CREATE OR ALTER PROCEDURE dbo.usp_ConfirmDisputeRefund
    @DisputeId bigint, @AdminId int, @RefundReference nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AdminId AND Role = 'Admin' AND Status = 'Active')
            THROW 51034, 'Only an active admin can confirm a refund.', 1;
        IF NULLIF(LTRIM(RTRIM(@RefundReference)), N'') IS NULL
            THROW 51037, 'Enter the reference of the completed refund.', 1;
        UPDATE dbo.OrderDisputes WITH (UPDLOCK)
        SET RefundReference = LTRIM(RTRIM(@RefundReference)), RefundConfirmedBy = @AdminId, RefundConfirmedAt = SYSUTCDATETIME()
        WHERE DisputeId = @DisputeId AND Status = 'Resolved' AND Decision = 'RefundApproved' AND RefundConfirmedAt IS NULL;
        IF @@ROWCOUNT <> 1 THROW 51038, 'Only an approved, not yet confirmed refund can be confirmed.', 1;
        INSERT dbo.AdminActions (AdminId, Action, EntityType, EntityId, Reason)
        VALUES (@AdminId, N'Confirm refund completed', 'OrderDispute', @DisputeId, CONCAT(N'Reference: ', LTRIM(RTRIM(@RefundReference))));
        COMMIT;
    END TRY BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
-- V002 (D4/D6): settlements can only be written the right way, even by code that
-- bypasses the procedures:
--   * a new settlement is Pending, for a Completed order of that seller, with exactly
--     the order's subtotal, 3 % commission and delivery fee;
--   * amounts never change afterwards;
--   * Released needs an active admin and a payout reference, and is then final.
CREATE TRIGGER dbo.trg_SellerSettlements_Guard ON dbo.SellerSettlements AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i LEFT JOIN deleted d ON d.OrderId = i.OrderId JOIN dbo.Orders o ON o.OrderId = i.OrderId
               WHERE d.OrderId IS NULL
                 AND (i.Status <> 'Pending' OR o.Status <> 'Completed' OR i.SellerId <> o.SellerId
                      OR i.MerchandiseSubtotal <> o.Subtotal OR i.CommissionAmount <> o.CommissionAmount OR i.ShippingFee <> o.ShippingFee))
        THROW 51043, 'A settlement can only be created as Pending for a completed order, with that order''s amounts.', 1;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.OrderId = i.OrderId
               WHERE i.Amount <> d.Amount OR i.MerchandiseSubtotal <> d.MerchandiseSubtotal OR i.CommissionAmount <> d.CommissionAmount
                  OR i.ShippingFee <> d.ShippingFee OR i.SellerId <> d.SellerId OR i.IsSandbox <> d.IsSandbox OR d.Status = 'Released')
        THROW 51044, 'Settlement amounts cannot change, and a released settlement is final.', 1;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.OrderId = i.OrderId
               WHERE i.Status = 'Released'
                 AND (NULLIF(LTRIM(RTRIM(i.PayoutReference)), N'') IS NULL
                      OR NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.UserId = i.ReleasedBy AND u.Role = 'Admin' AND u.Status = 'Active')))
        THROW 51045, 'A payout can only be confirmed by an active admin with a payout reference.', 1;
END;
GO

/* ---------- Step 8: refresh views that read Orders, record the version ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
EXEC sys.sp_refreshview N'dbo.vw_AdminDashboard';
INSERT dbo.SchemaMigrations (Version, Description) VALUES ('V001', N'Baseline UniMarket_BusinessAligned.sql (recorded by V002)');
INSERT dbo.SchemaMigrations (Version, Description)
VALUES ('V002', N'Multi-item orders (Orders + OrderItems, usp_Checkout) with business rules D1-D6');
INSERT #V002Steps VALUES ('8-finish');
GO

/* ---------- Step 9: verify, then COMMIT or ROLLBACK ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V002: no open migration transaction; stopping.', 16, 1); SET NOEXEC ON; END
GO
DECLARE @errors TABLE (Problem nvarchar(400));

IF (SELECT COUNT(*) FROM #V002Steps) <> 8
    INSERT @errors VALUES (N'Not every migration step ran: ' + (SELECT STRING_AGG(Step, ',') FROM #V002Steps));

-- New procedures / trigger must exist and be the V002 versions.
INSERT @errors
SELECT N'Module missing or not updated: ' + v.name
FROM (VALUES ('usp_Checkout'), ('usp_StartPayment'), ('usp_RecordPaymentResult'), ('usp_ShipOrder'), ('usp_CompleteOrder'),
             ('usp_CancelOrder'), ('usp_ExpirePendingOrders'), ('usp_MarkSettlementReleased'), ('usp_OpenOrderDispute'),
             ('usp_ResolveOrderDispute'), ('usp_ConfirmDisputeRefund'), ('trg_SellerSettlements_Guard')) AS v(name)
WHERE OBJECT_DEFINITION(OBJECT_ID('dbo.' + v.name)) IS NULL OR OBJECT_DEFINITION(OBJECT_ID('dbo.' + v.name)) NOT LIKE '%V002%';

-- Existing settlements keep their recorded amount; their breakdown adds up (V001 rule: no delivery fee paid out).
IF EXISTS (SELECT 1 FROM dbo.SellerSettlements s JOIN dbo.Orders o ON o.OrderId = s.OrderId
           WHERE s.MerchandiseSubtotal <> o.Subtotal OR s.CommissionAmount <> o.CommissionAmount OR s.ShippingFee <> 0
              OR s.Amount <> o.SellerProceeds)
    INSERT @errors VALUES (N'Existing settlement breakdown does not match its order.');
-- Payment deadline derived from confirmation time.
IF EXISTS (SELECT 1 FROM dbo.Orders WHERE (ConfirmedAt IS NULL AND PaymentDueAt IS NOT NULL) OR PaymentDueAt <> DATEADD(hour, 24, ConfirmedAt))
    INSERT @errors VALUES (N'PaymentDueAt is not ConfirmedAt + 24 h.');
IF EXISTS (SELECT 1 FROM dbo.Orders WHERE SellerPayoutTotal <> SellerProceeds + ShippingFee)
    INSERT @errors VALUES (N'SellerPayoutTotal is not proceeds + delivery fee.');

-- Every order kept, with exactly one item that matches the old single-product columns.
IF (SELECT COUNT(*) FROM dbo.Orders) <> (SELECT COUNT(*) FROM #V002Orders)
    INSERT @errors VALUES (N'Order count changed.');
INSERT @errors
SELECT N'Order ' + CAST(s.OrderId AS nvarchar(20)) + N' does not match its snapshot.'
FROM #V002Orders s
LEFT JOIN dbo.Orders o ON o.OrderId = s.OrderId
LEFT JOIN dbo.OrderItems i ON i.OrderId = s.OrderId
WHERE o.OrderId IS NULL OR i.OrderItemId IS NULL
   OR (SELECT COUNT(*) FROM dbo.OrderItems x WHERE x.OrderId = s.OrderId) <> 1
   OR i.ProductId <> s.ProductId OR i.ProductTitle <> s.ProductTitle OR i.UnitPrice <> s.ItemPrice OR i.SellerId <> s.SellerId
   OR o.Subtotal <> s.ItemPrice OR o.ShippingFee <> s.ShippingFee OR o.TotalAmount <> s.TotalAmount
   OR o.CommissionAmount <> s.CommissionAmount OR o.SellerProceeds <> s.SellerProceeds
   OR o.BuyerId <> s.BuyerId OR o.SellerId <> s.SellerId OR o.Status <> s.Status
   OR ISNULL(o.PaymentProvider, '') <> ISNULL(s.PaymentProvider, '')
   OR o.CreatedAt <> s.CreatedAt OR o.ConfirmBy <> s.ConfirmBy
   OR ISNULL(o.ConfirmedAt, '19000101') <> ISNULL(s.ConfirmedAt, '19000101') OR ISNULL(o.PaidAt, '19000101') <> ISNULL(s.PaidAt, '19000101')
   OR ISNULL(o.ShippedAt, '19000101') <> ISNULL(s.ShippedAt, '19000101') OR ISNULL(o.CompletedAt, '19000101') <> ISNULL(s.CompletedAt, '19000101')
   OR ISNULL(o.CancelledAt, '19000101') <> ISNULL(s.CancelledAt, '19000101')
   OR o.RecipientName <> s.RecipientName OR o.RecipientPhone <> s.RecipientPhone OR o.DeliveryAddress <> s.DeliveryAddress
   OR ISNULL(o.CancellationReason, N'') <> ISNULL(s.CancellationReason, N'');

-- Totals.
IF (SELECT SUM(Subtotal) FROM dbo.Orders) <> (SELECT SUM(ItemPrice) FROM #V002Orders)
 OR (SELECT SUM(TotalAmount) FROM dbo.Orders) <> (SELECT SUM(TotalAmount) FROM #V002Orders)
 OR (SELECT SUM(CommissionAmount) FROM dbo.Orders) <> (SELECT SUM(CommissionAmount) FROM #V002Orders)
 OR (SELECT SUM(SellerProceeds) FROM dbo.Orders) <> (SELECT SUM(SellerProceeds) FROM #V002Orders)
 OR (SELECT SUM(UnitPrice * Quantity) FROM dbo.OrderItems) <> (SELECT SUM(ItemPrice) FROM #V002Orders)
    INSERT @errors VALUES (N'Financial totals changed.');

-- Every other table keeps its rows; related data is unchanged.
INSERT @errors
SELECT N'Row count changed in ' + c.TableName
FROM #V002Counts c JOIN sys.tables t ON t.name = c.TableName
CROSS APPLY (SELECT SUM(p.rows) AS RowCnt FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0, 1)) n
WHERE n.RowCnt <> c.RowCnt;
IF EXISTS (
    SELECT 1 FROM #V002Checksums s
    WHERE s.Payments    <> (SELECT CHECKSUM_AGG(CHECKSUM(PaymentId, OrderId, Provider, RequestKey, ProviderReference, Amount, Status, IsSandbox, CreatedAt, FinishedAt)) FROM dbo.Payments)
       OR s.Settlements <> (SELECT CHECKSUM_AGG(CHECKSUM(OrderId, SellerId, Amount, Status, IsSandbox, CreatedAt, ReleasedAt)) FROM dbo.SellerSettlements)
       OR s.Reviews     <> (SELECT CHECKSUM_AGG(CHECKSUM(ReviewId, OrderId, ReviewerId, RevieweeId, Rating, Comment, IsHidden, CreatedAt)) FROM dbo.Reviews)
       OR s.History     <> (SELECT CHECKSUM_AGG(CHECKSUM(HistoryId, OrderId, Status, ChangedBy, Note, ChangedAt)) FROM dbo.OrderStatusHistory)
       OR s.Deliveries  <> (SELECT CHECKSUM_AGG(CHECKSUM(OrderId, Carrier, TrackingNumber, ShippedAt, ReceivedAt)) FROM dbo.Deliveries)
       OR s.Products    <> (SELECT CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, Title, Price, Status, ModerationStatus, UpdatedAt)) FROM dbo.Products))
    INSERT @errors VALUES (N'Payments, settlements, reviews, history, deliveries or products changed.');

-- Integrity of the new model.
IF EXISTS (SELECT 1 FROM dbo.Orders o WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId))
    INSERT @errors VALUES (N'An order has no items.');
IF EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.Subtotal <> (SELECT SUM(i.UnitPrice * i.Quantity) FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId))
    INSERT @errors VALUES (N'An order subtotal differs from the sum of its items.');

IF EXISTS (SELECT 1 FROM @errors)
BEGIN
    SELECT Problem AS [V002 verification failed] FROM @errors;
    ROLLBACK;
    RAISERROR('V002: verification failed; the migration was rolled back. Nothing was changed.', 16, 1);
    SET NOEXEC ON;
END
ELSE
BEGIN
    COMMIT;
    DECLARE @orderCount int = (SELECT COUNT(*) FROM dbo.Orders), @itemCount int = (SELECT COUNT(*) FROM dbo.OrderItems);
    PRINT CONCAT('V002 applied and verified: ', @orderCount, ' orders, ', @itemCount, ' order items.');
END
GO
SET NOEXEC OFF;
GO
