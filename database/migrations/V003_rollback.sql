/* =====================================================================
   V003 rollback - REVIEW ONLY, NOT APPLIED.
   Reverses V003 ONLY while no V003-format data exists (no user / product without a campus,
   no shipping quote, no self-declared university, no pickup / home zone in use).
   Otherwise it refuses: restoring NOT NULL would require inventing campuses, which is not allowed.
   In that case restore the verified pre-V003 backup instead.
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V003_rollback.sql -v Approved="YES" TargetDb="<Db>" ProductionApproval="NO"
   Note: the provider CHECKs come back with explicit names (CK_Orders_PaymentProvider, ...) instead of the original
   system-generated names; their rule is identical.
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
IF '$(Approved)' <> 'YES'
BEGIN RAISERROR('V003 rollback: not approved.', 16, 1); SET NOEXEC ON; END
GO
IF DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V003 rollback: connected database does not match TargetDb; stopping.', 16, 1); SET NOEXEC ON; END
IF DB_NAME() = N'UniMarketJava' AND '$(ProductionApproval)' <> 'YES'
BEGIN RAISERROR('V003 rollback: UniMarketJava needs ProductionApproval="YES" (not given).', 16, 1); SET NOEXEC ON; END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V003')
BEGIN RAISERROR('V003 rollback: V003 is not recorded as applied.', 16, 1); SET NOEXEC ON; END
IF EXISTS (SELECT 1 FROM dbo.Users WHERE CampusId IS NULL OR DeclaredUniversityName IS NOT NULL OR HomeZoneId IS NOT NULL)
   OR EXISTS (SELECT 1 FROM dbo.Products WHERE CampusId IS NULL OR PickupZoneId IS NOT NULL)
   OR EXISTS (SELECT 1 FROM dbo.OrderShippingQuotes)
   OR EXISTS (SELECT 1 FROM dbo.Orders WHERE PaymentProvider = 'BankQR')
   OR EXISTS (SELECT 1 FROM dbo.Payments WHERE Provider = 'BankQR')
   OR EXISTS (SELECT 1 FROM dbo.ProductPromotions WHERE Provider = 'BankQR')
BEGIN RAISERROR('V003 rollback refused: V003-format data exists. Restore the pre-V003 backup instead.', 16, 1); SET NOEXEC ON; END
GO
BEGIN TRANSACTION;
GO
-- Provider CHECKs back to the V001 rule (MoMo / ZaloPay); names are explicit now.
ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_PaymentProvider;
ALTER TABLE dbo.Payments DROP CONSTRAINT CK_Payments_Provider;
ALTER TABLE dbo.ProductPromotions DROP CONSTRAINT CK_ProductPromotions_Provider;
ALTER TABLE dbo.Orders WITH CHECK ADD CONSTRAINT CK_Orders_PaymentProvider CHECK (PaymentProvider IN ('MoMo', 'ZaloPay'));
ALTER TABLE dbo.Payments WITH CHECK ADD CONSTRAINT CK_Payments_Provider CHECK (Provider IN ('MoMo', 'ZaloPay'));
ALTER TABLE dbo.ProductPromotions WITH CHECK ADD CONSTRAINT CK_ProductPromotions_Provider CHECK (Provider IN ('MoMo', 'ZaloPay'));
GO
DROP PROCEDURE dbo.usp_CheckoutWithShipping;
DROP TYPE dbo.SellerShippingList;
DROP TABLE dbo.OrderShippingQuotes;
GO
-- vw_ProductCatalog (V003 version) reads Products.PickupZoneId: drop it first; it is recreated below.
DROP VIEW dbo.vw_ProductCatalog;
GO
DROP INDEX IX_ProductSearch ON dbo.Products;
ALTER TABLE dbo.Products DROP CONSTRAINT CK_Products_Location;
ALTER TABLE dbo.Products DROP CONSTRAINT FK_Products_PickupZone;
ALTER TABLE dbo.Products DROP COLUMN PickupZoneId;
ALTER TABLE dbo.Products ALTER COLUMN CampusId int NOT NULL;
CREATE INDEX IX_ProductSearch ON dbo.Products(Status, ModerationStatus, CampusId, CategoryId, Condition, Price)
    INCLUDE (Title, SellerId, CreatedAt);
GO
ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Affiliation;
ALTER TABLE dbo.Users DROP COLUMN DeclaredUniversityKey;
ALTER TABLE dbo.Users DROP CONSTRAINT FK_Users_HomeZone;
ALTER TABLE dbo.Users DROP COLUMN HomeZoneId, DeclaredUniversityName;
ALTER TABLE dbo.Users ALTER COLUMN CampusId int NOT NULL;
-- Next batch: the original V001 catalog view, recreated with its exact V001 text AFTER Products.CampusId is NOT NULL
-- again, so its column nullability and its sys.sql_modules text match the pre-V003 database (verified by diff).
-- No comment may precede CREATE VIEW inside its batch: it would become part of the stored definition.
GO
CREATE VIEW dbo.vw_ProductCatalog AS
 SELECT p.ProductId,p.SellerId,p.Title,p.Description,p.Condition,p.Price,p.OriginalPrice,p.CategoryId,
 c.Name AS CategoryName,p.CampusId,ca.Name AS CampusName,ca.UniversityId,
 u.FullName AS SellerName,r.AverageRating,COALESCE(r.ReviewCount,0) AS ReviewCount,
 im.ImageUrl,p.CreatedAt,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.ProductPromotions pp WHERE pp.ProductId=p.ProductId
 AND pp.Status='Paid' AND pp.StartsAt<=SYSUTCDATETIME() AND pp.EndsAt>SYSUTCDATETIME()) THEN 1 ELSE 0 END AS bit) AS IsFeatured
 FROM dbo.Products p JOIN dbo.Users u ON u.UserId=p.SellerId
 JOIN dbo.Categories c ON c.CategoryId=p.CategoryId JOIN dbo.Campuses ca ON ca.CampusId=p.CampusId
 LEFT JOIN dbo.vw_UserRatings r ON r.UserId=p.SellerId
 OUTER APPLY(SELECT TOP(1) ImageUrl FROM dbo.ProductImages WHERE ProductId=p.ProductId ORDER BY SortOrder,ImageId) im
 WHERE p.Status='Available' AND p.ModerationStatus='Approved' AND u.Status='Active' AND c.IsActive=1;
GO
ALTER TABLE dbo.Campuses DROP CONSTRAINT FK_Campuses_Zone;
ALTER TABLE dbo.Campuses DROP COLUMN ZoneId;
DROP TABLE dbo.LocationZones;
DELETE FROM dbo.SchemaMigrations WHERE Version = 'V003';
GO
IF @@TRANCOUNT = 1
BEGIN
    COMMIT;
    PRINT 'V003 rolled back: schema is V001 + V002 again.';
END
GO
SET NOEXEC OFF;
GO
