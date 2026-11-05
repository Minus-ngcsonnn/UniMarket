/* =====================================================================
   V005 rollback - removes the "Other" category and Products.CustomCategoryName.
   Refuses while a listing still uses the "Other" category (move those listings to another category first), so no
   listing loses its category.
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V005_rollback.sql -v Approved="YES" TargetDb="<Db>"
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
IF '$(Approved)' <> 'YES' OR DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V005 rollback: not approved or wrong database; nothing was changed.', 16, 1); SET NOEXEC ON; END
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V005')
BEGIN RAISERROR('V005 rollback: V005 is not applied.', 16, 1); SET NOEXEC ON; END
GO
IF EXISTS (SELECT 1 FROM dbo.Products p JOIN dbo.Categories c ON c.CategoryId = p.CategoryId WHERE c.AllowsCustomName = 1)
BEGIN RAISERROR('V005 rollback: listings still use the "Other" category; nothing was changed.', 16, 1); SET NOEXEC ON; END
GO
BEGIN TRANSACTION;
ALTER TABLE dbo.Products DROP CONSTRAINT CK_Products_CustomCategoryName;
ALTER TABLE dbo.Products DROP COLUMN CustomCategoryName;
DELETE dbo.Categories WHERE AllowsCustomName = 1 AND Name = N'Other';
ALTER TABLE dbo.Categories DROP CONSTRAINT DF_Categories_AllowsCustomName;
ALTER TABLE dbo.Categories DROP COLUMN AllowsCustomName;
DELETE dbo.SchemaMigrations WHERE Version = 'V005';
COMMIT;
PRINT 'V005 rolled back.';
GO
SET NOEXEC OFF;
GO
