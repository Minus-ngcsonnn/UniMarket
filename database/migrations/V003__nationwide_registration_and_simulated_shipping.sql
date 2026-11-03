/* =====================================================================
   V003 - Nationwide registration and simulated shipping
   ---------------------------------------------------------------------
   STATUS: tested on isolated copies only; NOT APPLIED to UniMarketJava.
   Design: database/docs/V003_DESIGN_nationwide_and_simulated_shipping.md
   Rollback: database/migrations/V003_rollback.sql

   What it does (additive; V001/V002 business rules and money formulas unchanged):
     1. dbo.LocationZones (curated demo areas with APPROXIMATE centre points)
     2. Campuses.ZoneId (+ FPT Hoa Lac -> its area)
     3. Users: CampusId nullable, DeclaredUniversityName (self-declared, unverified),
        DeclaredUniversityKey (normalised, reporting only), HomeZoneId, CK_Users_Affiliation
     4. Products: CampusId nullable (IX_ProductSearch recreated), PickupZoneId, CK_Products_Location
     5. vw_ProductCatalog: LEFT JOIN campus / zone (same filter, three extra columns)
     6. dbo.OrderShippingQuotes (one simulated quote per order)
     7. dbo.SellerShippingList (table type) + dbo.usp_CheckoutWithShipping (wraps the
        unchanged V002 dbo.usp_Checkout and sets one shipping fee per seller order)
     8. Payment providers: adds the simulated 'BankQR' provider to the three provider CHECKs
        (Orders.PaymentProvider, Payments.Provider, ProductPromotions.Provider); MoMo / ZaloPay unchanged

   Run ONLY after explicit approval, first on an isolated copy:
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V003__nationwide_registration_and_simulated_shipping.sql
            -v Approved="YES" TargetDb="<Db>" ProductionApproval="NO"
   TargetDb must equal the connected database. Running on UniMarketJava additionally needs ProductionApproval="YES"
   (a separate, explicit team decision). Never re-run V001 or V002. Back up and verify before applying.
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------- Step 0: guards and baseline ---------- */
-- Encoding guard: this file is UTF-8 and contains Vietnamese N'...' literals. If sqlcmd reads it with another code page
-- (no -f 65001), the literal below is not U+1EA7 and the zone names would be stored garbled: refuse before any change.
IF UNICODE(N'ầ') <> 7847
BEGIN RAISERROR('V003: the script was read with the wrong code page. Run sqlcmd with -f 65001; nothing was changed.', 16, 1); SET NOEXEC ON; END
GO
IF '$(Approved)' <> 'YES'
BEGIN RAISERROR('V003: not approved. Pass -v Approved="YES" only after team approval.', 16, 1); SET NOEXEC ON; END
GO
IF DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V003: connected database does not match TargetDb; stopping.', 16, 1); SET NOEXEC ON; END
IF DB_NAME() = N'UniMarketJava' AND '$(ProductionApproval)' <> 'YES'
BEGIN RAISERROR('V003: UniMarketJava needs ProductionApproval="YES" (not given).', 16, 1); SET NOEXEC ON; END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V002')
BEGIN RAISERROR('V003: V002 must be applied first.', 16, 1); SET NOEXEC ON; END
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V003')
BEGIN RAISERROR('V003: already applied; it must not run twice.', 16, 1); SET NOEXEC ON; END
IF OBJECT_ID('dbo.LocationZones') IS NOT NULL OR OBJECT_ID('dbo.OrderShippingQuotes') IS NOT NULL
   OR OBJECT_ID('dbo.usp_CheckoutWithShipping') IS NOT NULL OR TYPE_ID('dbo.SellerShippingList') IS NOT NULL
BEGIN RAISERROR('V003: objects already exist; stop and investigate.', 16, 1); SET NOEXEC ON; END
GO

IF OBJECT_ID('tempdb..#V003Baseline') IS NOT NULL DROP TABLE #V003Baseline;
SELECT (SELECT COUNT(*) FROM dbo.Users) AS Users,
       (SELECT COUNT(*) FROM dbo.Products) AS Products,
       (SELECT COUNT(*) FROM dbo.Orders) AS Orders,
       (SELECT COUNT(*) FROM dbo.OrderItems) AS OrderItems,
       (SELECT COUNT(*) FROM dbo.Payments) AS Payments,
       (SELECT COUNT(*) FROM dbo.SellerSettlements) AS Settlements,
       (SELECT COALESCE(SUM(Subtotal), 0) FROM dbo.Orders) AS Subtotals,
       (SELECT COALESCE(SUM(TotalAmount), 0) FROM dbo.Orders) AS OrderTotals,
       (SELECT COALESCE(SUM(CommissionAmount), 0) FROM dbo.Orders) AS Commissions,
       (SELECT COALESCE(SUM(SellerPayoutTotal), 0) FROM dbo.Orders) AS Payouts,
       (SELECT COALESCE(SUM(Amount), 0) FROM dbo.SellerSettlements) AS SettlementAmounts,
       (SELECT CHECKSUM_AGG(CHECKSUM(UserId, Email, CampusId, Role, Status, EmailVerifiedAt)) FROM dbo.Users) AS UsersChecksum,
       (SELECT CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, CampusId, Status, ModerationStatus, Price)) FROM dbo.Products) AS ProductsChecksum,
       (SELECT COUNT(*) FROM dbo.vw_ProductCatalog) AS CatalogRows
INTO #V003Baseline;

BEGIN TRANSACTION;
GO

/* ---------- Step 1: location zones ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
CREATE TABLE dbo.LocationZones (
    ZoneId    int IDENTITY CONSTRAINT PK_LocationZones PRIMARY KEY,
    Code      varchar(30)   NOT NULL CONSTRAINT UQ_LocationZones_Code UNIQUE,
    Name      nvarchar(150) NOT NULL,
    Province  nvarchar(100) NOT NULL,
    Latitude  decimal(9,6)  NOT NULL CONSTRAINT CK_LocationZones_Latitude CHECK (Latitude BETWEEN 8.0 AND 23.5),
    Longitude decimal(9,6)  NOT NULL CONSTRAINT CK_LocationZones_Longitude CHECK (Longitude BETWEEN 102.0 AND 110.0),
    IsActive  bit           NOT NULL CONSTRAINT DF_LocationZones_IsActive DEFAULT 1
);
-- Demo areas for the academic MVP. Each zone has ONE reference point taken from OpenStreetMap (Nominatim search,
-- retrieved 2026-11-03; source object in the comment). The point is the centroid / representative point of that
-- object (a ward boundary, a campus or a landmark): an APPROXIMATE zone centre for simulated distances only, never a
-- pickup address. Names are areas, not official administrative units.
INSERT dbo.LocationZones (Code, Name, Province, Latitude, Longitude) VALUES
 ('HN-HOA-LAC',       N'Hòa Lạc (Khu CNC Hòa Lạc)',            N'Hà Nội',          21.013528, 105.525261), -- OSM way/800878327 FPT University campus
 ('HN-CAU-GIAY',      N'Cầu Giấy',                            N'Hà Nội',          21.028670, 105.786604), -- OSM relation/19335053 Phường Cầu Giấy
 ('HN-BACH-KHOA',     N'Bách Khoa',                           N'Hà Nội',          21.005527, 105.843593), -- OSM relation/16092230 Hanoi University of Science and Technology
 ('HN-DONG-DA',       N'Đống Đa',                             N'Hà Nội',          21.010730, 105.818202), -- OSM relation/19331659 Phường Đống Đa
 ('HN-HOAN-KIEM',     N'Hoàn Kiếm',                           N'Hà Nội',          21.028831, 105.852536), -- OSM relation/198437 Hồ Hoàn Kiếm
 ('HN-THANH-XUAN',    N'Thanh Xuân',                          N'Hà Nội',          20.998358, 105.804240), -- OSM relation/19335051 Phường Thanh Xuân
 ('HN-HA-DONG',       N'Hà Đông',                             N'Hà Nội',          20.970219, 105.774957), -- OSM node/11176220557 Hà Đông station
 ('HCM-BEN-THANH',    N'Bến Thành',                           N'TP. Hồ Chí Minh', 10.772530, 106.698037), -- OSM way/39514795 Chợ Bến Thành
 ('HCM-LY-THUONG-KIET', N'Lý Thường Kiệt (ĐH Bách khoa)',     N'TP. Hồ Chí Minh', 10.773350, 106.659632), -- OSM way/237665212 HCMUT, 268 Lý Thường Kiệt
 ('HCM-BINH-THANH',   N'Bình Thạnh',                          N'TP. Hồ Chí Minh', 10.811181, 106.703394), -- OSM relation/19260954 Phường Bình Thạnh
 ('HCM-GO-VAP',       N'Gò Vấp',                              N'TP. Hồ Chí Minh', 10.838417, 106.675343), -- OSM relation/19261094 Phường Gò Vấp
 ('HCM-KHU-CNC',      N'Khu Công nghệ cao (Thủ Đức)',         N'TP. Hồ Chí Minh', 10.841417, 106.810074), -- OSM way/1022939891 FPT University HCMC
 ('HCM-LANG-DAI-HOC', N'Làng Đại học (Thủ Đức)',              N'TP. Hồ Chí Minh', 10.882143, 106.782565), -- OSM node/11562800202 VNU-HCM dormitory B
 ('DN-HAI-CHAU',      N'Hải Châu',                            N'Đà Nẵng',         16.058954, 108.219484), -- OSM relation/13969677 Phường Hải Châu
 ('DN-AN-HAI',        N'An Hải (Sơn Trà)',                    N'Đà Nẵng',         16.070062, 108.236422), -- OSM relation/13996723 Phường An Hải
 ('DN-NGU-HANH-SON',  N'Ngũ Hành Sơn (ĐH FPT Đà Nẵng)',       N'Đà Nẵng',         15.967483, 108.260361), -- OSM way/1058072008 FPT University Da Nang
 ('DN-LIEN-CHIEU',    N'Liên Chiểu (Hòa Khánh)',              N'Đà Nẵng',         16.075016, 108.152724), -- OSM way/968341228 University of Science and Technology - UD
 ('CT-NINH-KIEU',     N'Ninh Kiều',                           N'Cần Thơ',         10.033477, 105.780409), -- OSM relation/13512464 Phường Ninh Kiều
 ('CT-DH-CAN-THO',    N'Đại học Cần Thơ (khu II)',            N'Cần Thơ',         10.032149, 105.768305), -- OSM way/165716609 Can Tho University campus II
 ('CT-AN-BINH',       N'An Bình (ĐH FPT Cần Thơ)',            N'Cần Thơ',         10.013490, 105.731715), -- OSM way/1157134865 FPT University Can Tho
 ('CT-BINH-THUY',     N'Bình Thủy',                           N'Cần Thơ',         10.072194, 105.752804); -- OSM relation/13514267 Phường Bình Thủy
GO

-- Stored names must be real Vietnamese (U+1EA7 'ầ' in "Cầu Giấy", U+00E0 'à' in "Hà Nội").
IF NOT EXISTS (SELECT 1 FROM dbo.LocationZones WHERE Code = 'HN-CAU-GIAY'
               AND UNICODE(SUBSTRING(Name, 2, 1)) = 7847 AND UNICODE(SUBSTRING(Province, 2, 1)) = 224)
BEGIN RAISERROR('V003: zone names were stored with a wrong encoding; rolling back.', 16, 1); ROLLBACK; SET NOEXEC ON; END
GO

/* ---------- Step 2: campuses -> zone ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Campuses ADD ZoneId int NULL CONSTRAINT FK_Campuses_Zone REFERENCES dbo.LocationZones(ZoneId);
GO
UPDATE dbo.Campuses SET ZoneId = (SELECT ZoneId FROM dbo.LocationZones WHERE Code = 'HN-HOA-LAC') WHERE Name = N'FPT Hoa Lac';
IF EXISTS (SELECT 1 FROM dbo.Campuses WHERE ZoneId IS NULL)
BEGIN RAISERROR('V003: every existing campus needs a zone (listings without one could not be shipped).', 16, 1); SET NOEXEC ON; END
GO

/* ---------- Step 3: users - optional campus, self-declared university ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Users ALTER COLUMN CampusId int NULL;              -- FK FK__Users__CampusId__... is kept
ALTER TABLE dbo.Users ADD
    DeclaredUniversityName nvarchar(200) NULL,                     -- free text, NOT verified enrolment
    HomeZoneId int NULL CONSTRAINT FK_Users_HomeZone REFERENCES dbo.LocationZones(ZoneId);
GO
ALTER TABLE dbo.Users ADD DeclaredUniversityKey AS LOWER(LTRIM(RTRIM(DeclaredUniversityName))) PERSISTED;  -- reporting only
-- COALESCE: a CHECK with an UNKNOWN result passes, so NULL text must count as empty.
ALTER TABLE dbo.Users WITH CHECK ADD CONSTRAINT CK_Users_Affiliation
    CHECK (Role = 'Admin' OR CampusId IS NOT NULL OR LEN(LTRIM(RTRIM(COALESCE(DeclaredUniversityName, N'')))) >= 2);
GO

/* ---------- Step 4: products - pickup location ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
DROP INDEX IX_ProductSearch ON dbo.Products;
ALTER TABLE dbo.Products ALTER COLUMN CampusId int NULL;           -- FK FK__Products__Campus__... is kept
ALTER TABLE dbo.Products ADD PickupZoneId int NULL CONSTRAINT FK_Products_PickupZone REFERENCES dbo.LocationZones(ZoneId);
GO
ALTER TABLE dbo.Products WITH CHECK ADD CONSTRAINT CK_Products_Location CHECK (CampusId IS NOT NULL OR PickupZoneId IS NOT NULL);
CREATE INDEX IX_ProductSearch ON dbo.Products(Status, ModerationStatus, CampusId, CategoryId, Condition, Price)
    INCLUDE (Title, SellerId, CreatedAt, PickupZoneId);
GO

/* ---------- Step 5: catalog view - same rows, nullable campus, pickup zone ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER VIEW dbo.vw_ProductCatalog AS
 SELECT p.ProductId,p.SellerId,p.Title,p.Description,p.Condition,p.Price,p.OriginalPrice,p.CategoryId,
 c.Name AS CategoryName,p.CampusId,ca.Name AS CampusName,ca.UniversityId,
 u.FullName AS SellerName,r.AverageRating,COALESCE(r.ReviewCount,0) AS ReviewCount,
 im.ImageUrl,p.CreatedAt,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.ProductPromotions pp WHERE pp.ProductId=p.ProductId
 AND pp.Status='Paid' AND pp.StartsAt<=SYSUTCDATETIME() AND pp.EndsAt>SYSUTCDATETIME()) THEN 1 ELSE 0 END AS bit) AS IsFeatured,
 z.ZoneId AS PickupZoneId, z.Name AS PickupZoneName, z.Province AS PickupProvince
 FROM dbo.Products p JOIN dbo.Users u ON u.UserId=p.SellerId
 JOIN dbo.Categories c ON c.CategoryId=p.CategoryId LEFT JOIN dbo.Campuses ca ON ca.CampusId=p.CampusId
 LEFT JOIN dbo.LocationZones z ON z.ZoneId=COALESCE(p.PickupZoneId, ca.ZoneId)
 LEFT JOIN dbo.vw_UserRatings r ON r.UserId=p.SellerId
 OUTER APPLY(SELECT TOP(1) ImageUrl FROM dbo.ProductImages WHERE ProductId=p.ProductId ORDER BY SortOrder,ImageId) im
 WHERE p.Status='Available' AND p.ModerationStatus='Approved' AND u.Status='Active' AND c.IsActive=1;
GO

/* ---------- Step 6: simulated shipping quote of each order ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
CREATE TABLE dbo.OrderShippingQuotes (
    OrderId        bigint        NOT NULL CONSTRAINT PK_OrderShippingQuotes PRIMARY KEY
                                 CONSTRAINT FK_OrderShippingQuotes_Order REFERENCES dbo.Orders(OrderId),
    Carrier        varchar(30)   NOT NULL CONSTRAINT CK_OrderShippingQuotes_Carrier
                                 CHECK (Carrier IN ('GRAB_EXPRESS_SIM', 'AHAMOVE_SIM', 'STANDARD_SIM')),
    PickupZoneId   int           NOT NULL CONSTRAINT FK_OrderShippingQuotes_Pickup REFERENCES dbo.LocationZones(ZoneId),
    DeliveryZoneId int           NOT NULL CONSTRAINT FK_OrderShippingQuotes_Delivery REFERENCES dbo.LocationZones(ZoneId),
    DistanceKm     decimal(6,1)  NOT NULL CONSTRAINT CK_OrderShippingQuotes_Distance CHECK (DistanceKm BETWEEN 0 AND 2000),
    Fee            decimal(18,0) NOT NULL CONSTRAINT CK_OrderShippingQuotes_Fee CHECK (Fee BETWEEN 0 AND 1000000),
    FormulaVersion varchar(20)   NOT NULL,
    IsSimulated    bit           NOT NULL CONSTRAINT DF_OrderShippingQuotes_IsSimulated DEFAULT 1
                                 CONSTRAINT CK_OrderShippingQuotes_Simulated CHECK (IsSimulated = 1),
    CreatedAt      datetime2(0)  NOT NULL CONSTRAINT DF_OrderShippingQuotes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_OrderShippingQuotes_FreeRadius CHECK (DistanceKm > 3.0 OR Fee = 0)      -- free up to and including 3 km
);
GO
CREATE TYPE dbo.SellerShippingList AS TABLE (
    SellerId       int           NOT NULL PRIMARY KEY,
    Carrier        varchar(30)   NOT NULL,
    PickupZoneId   int           NOT NULL,
    DistanceKm     decimal(6,1)  NOT NULL,
    Fee            decimal(18,0) NOT NULL,
    FormulaVersion varchar(20)   NOT NULL
);
GO

/* ---------- Step 7: checkout with one simulated shipping fee per seller ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
-- V003: wraps the UNCHANGED V002 dbo.usp_Checkout (locks, availability, no self-purchase, quantity 1,
-- price snapshots, one order per seller, reservations, cart clean-up, history, deadlines) in one transaction,
-- then stores the backend-calculated fee of each seller order and its simulated quote.
-- All-or-nothing: if any check fails, nothing (orders, reservations, cart changes) remains.
-- The fees are calculated by the backend; this procedure re-checks shape and bounds only.
-- Result sets: usp_Checkout's own (OrderId, SellerId) set, then this procedure's final (OrderId, SellerId) set;
-- callers read the LAST result set.
CREATE PROCEDURE dbo.usp_CheckoutWithShipping
    @BuyerId int,
    @ProductIds dbo.ProductIdList READONLY,
    @Shipping dbo.SellerShippingList READONLY,
    @DeliveryZoneId int,
    @RecipientName nvarchar(150),
    @RecipientPhone varchar(20),
    @DeliveryAddress nvarchar(500),
    @PaymentProvider varchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM dbo.LocationZones WHERE ZoneId = @DeliveryZoneId AND IsActive = 1)
            THROW 51060, 'Choose a supported delivery area.', 1;
        IF NOT EXISTS (SELECT 1 FROM @Shipping)
           OR EXISTS (SELECT 1 FROM @Shipping WHERE Fee < 0 OR Fee > 1000000 OR DistanceKm < 0 OR DistanceKm > 2000
                                                  OR (DistanceKm <= 3.0 AND Fee <> 0)
                                                  OR Carrier NOT IN ('GRAB_EXPRESS_SIM', 'AHAMOVE_SIM', 'STANDARD_SIM'))
            THROW 51061, 'Invalid shipping quote.', 1;

        -- V002 checkout, unchanged. Its fee is 0 here; the per-seller fee is set below in the same transaction.
        EXEC dbo.usp_Checkout @BuyerId = @BuyerId, @ProductIds = @ProductIds, @RecipientName = @RecipientName,
             @RecipientPhone = @RecipientPhone, @DeliveryAddress = @DeliveryAddress,
             @PaymentProvider = @PaymentProvider, @ShippingFee = 0;

        -- The orders just created: each listing can be in only one active order (UX_ActiveOrderItems_Product).
        DECLARE @Created TABLE (OrderId bigint PRIMARY KEY, SellerId int NOT NULL UNIQUE);
        INSERT @Created (OrderId, SellerId)
        SELECT DISTINCT o.OrderId, o.SellerId
        FROM dbo.Orders AS o
        JOIN dbo.OrderItems AS oi ON oi.OrderId = o.OrderId
        JOIN @ProductIds AS r ON r.ProductId = oi.ProductId
        WHERE o.BuyerId = @BuyerId AND o.Status = 'Pending';

        IF (SELECT COUNT(*) FROM @Created) <> (SELECT COUNT(*) FROM @Shipping)
           OR EXISTS (SELECT 1 FROM @Created AS c LEFT JOIN @Shipping AS s ON s.SellerId = c.SellerId WHERE s.SellerId IS NULL)
            THROW 51062, 'Every seller order needs exactly one shipping quote.', 1;

        -- The pickup area must be the location of one of that seller's listings in this order.
        IF EXISTS (SELECT 1 FROM @Shipping AS s
                   WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderItems AS oi
                                     JOIN @Created AS c ON c.OrderId = oi.OrderId AND c.SellerId = s.SellerId
                                     JOIN dbo.Products AS p ON p.ProductId = oi.ProductId
                                     LEFT JOIN dbo.Campuses AS ca ON ca.CampusId = p.CampusId
                                     WHERE COALESCE(p.PickupZoneId, ca.ZoneId) = s.PickupZoneId))
            THROW 51063, 'The pickup area does not match the listings.', 1;

        UPDATE o SET ShippingFee = s.Fee
        FROM dbo.Orders AS o JOIN @Created AS c ON c.OrderId = o.OrderId JOIN @Shipping AS s ON s.SellerId = c.SellerId;

        INSERT dbo.OrderShippingQuotes (OrderId, Carrier, PickupZoneId, DeliveryZoneId, DistanceKm, Fee, FormulaVersion)
        SELECT c.OrderId, s.Carrier, s.PickupZoneId, @DeliveryZoneId, s.DistanceKm, s.Fee, s.FormulaVersion
        FROM @Created AS c JOIN @Shipping AS s ON s.SellerId = c.SellerId;

        COMMIT;
        SELECT OrderId, SellerId FROM @Created ORDER BY SellerId;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK; THROW; END CATCH;
END;
GO

/* ---------- Step 8: simulated Bank QR payment provider ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
-- The three V001 provider CHECKs have system-generated names; find them by table and definition.
DECLARE @drop nvarchar(max) = N'';
SELECT @drop += N'ALTER TABLE dbo.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(name) + N'; '
FROM sys.check_constraints
WHERE parent_object_id IN (OBJECT_ID('dbo.Orders'), OBJECT_ID('dbo.Payments'), OBJECT_ID('dbo.ProductPromotions'))
  AND definition LIKE '%''MoMo''%' AND definition LIKE '%''ZaloPay''%';
IF (SELECT COUNT(*) FROM sys.check_constraints
    WHERE parent_object_id IN (OBJECT_ID('dbo.Orders'), OBJECT_ID('dbo.Payments'), OBJECT_ID('dbo.ProductPromotions'))
      AND definition LIKE '%''MoMo''%' AND definition LIKE '%''ZaloPay''%') <> 3
BEGIN RAISERROR('V003: expected exactly 3 provider CHECK constraints.', 16, 1); SET NOEXEC ON; END
EXEC sys.sp_executesql @drop;
GO
-- 'BankQR' = simulated bank-transfer QR checkout (no real bank, no real account). NULL stays allowed as before.
ALTER TABLE dbo.Orders WITH CHECK ADD CONSTRAINT CK_Orders_PaymentProvider CHECK (PaymentProvider IN ('MoMo', 'ZaloPay', 'BankQR'));
ALTER TABLE dbo.Payments WITH CHECK ADD CONSTRAINT CK_Payments_Provider CHECK (Provider IN ('MoMo', 'ZaloPay', 'BankQR'));
ALTER TABLE dbo.ProductPromotions WITH CHECK ADD CONSTRAINT CK_ProductPromotions_Provider CHECK (Provider IN ('MoMo', 'ZaloPay', 'BankQR'));
GO

/* ---------- Step 9: record and verify ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V003: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
INSERT dbo.SchemaMigrations (Version, Description, AppliedAt, AppliedBy)
VALUES ('V003', N'Nationwide registration (self-declared university, optional campus) and simulated shipping quotes',
        SYSUTCDATETIME(), SUSER_SNAME());

DECLARE @problems nvarchar(max) = N'';
SELECT @problems = CONCAT(@problems,
    IIF(b.Users <> (SELECT COUNT(*) FROM dbo.Users), N'users; ', N''),
    IIF(b.Products <> (SELECT COUNT(*) FROM dbo.Products), N'products; ', N''),
    IIF(b.Orders <> (SELECT COUNT(*) FROM dbo.Orders), N'orders; ', N''),
    IIF(b.OrderItems <> (SELECT COUNT(*) FROM dbo.OrderItems), N'order items; ', N''),
    IIF(b.Payments <> (SELECT COUNT(*) FROM dbo.Payments), N'payments; ', N''),
    IIF(b.Settlements <> (SELECT COUNT(*) FROM dbo.SellerSettlements), N'settlements; ', N''),
    IIF(b.Subtotals <> (SELECT COALESCE(SUM(Subtotal), 0) FROM dbo.Orders), N'subtotals; ', N''),
    IIF(b.OrderTotals <> (SELECT COALESCE(SUM(TotalAmount), 0) FROM dbo.Orders), N'order totals; ', N''),
    IIF(b.Commissions <> (SELECT COALESCE(SUM(CommissionAmount), 0) FROM dbo.Orders), N'commissions; ', N''),
    IIF(b.Payouts <> (SELECT COALESCE(SUM(SellerPayoutTotal), 0) FROM dbo.Orders), N'payouts; ', N''),
    IIF(b.SettlementAmounts <> (SELECT COALESCE(SUM(Amount), 0) FROM dbo.SellerSettlements), N'settlement amounts; ', N''),
    IIF(b.UsersChecksum <> (SELECT CHECKSUM_AGG(CHECKSUM(UserId, Email, CampusId, Role, Status, EmailVerifiedAt)) FROM dbo.Users), N'user rows; ', N''),
    IIF(b.ProductsChecksum <> (SELECT CHECKSUM_AGG(CHECKSUM(ProductId, SellerId, CampusId, Status, ModerationStatus, Price)) FROM dbo.Products), N'product rows; ', N''),
    IIF(b.CatalogRows <> (SELECT COUNT(*) FROM dbo.vw_ProductCatalog), N'catalog rows; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Users WHERE CampusId IS NULL), N'user without campus; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Products WHERE CampusId IS NULL), N'product without campus; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.OrderShippingQuotes), N'unexpected quotes; ', N''))
FROM #V003Baseline AS b;
IF @problems <> N''
BEGIN
    RAISERROR(N'V003 post-checks FAILED (%s). Rolling back.', 16, 1, @problems);
    IF @@TRANCOUNT > 0 ROLLBACK;
    SET NOEXEC ON;
END
GO
IF @@TRANCOUNT = 1
BEGIN
    COMMIT;
    PRINT 'V003 applied and verified: existing rows, money totals and catalog rows unchanged.';
END
GO
SET NOEXEC OFF;
GO
