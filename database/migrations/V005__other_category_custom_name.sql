/* =====================================================================
   V005 - "Other" product category with a seller-typed category name
   ---------------------------------------------------------------------
   Rollback: database/migrations/V005_rollback.sql

   What it does (additive; existing categories, listings, orders and V001-V004 rules unchanged):
     1. dbo.Categories.AllowsCustomName (bit, default 0): marks a category whose listings carry a seller-typed name.
        Only admins / migrations manage categories; sellers never create one.
     2. One official category "Other" (IsActive = 1, AllowsCustomName = 1), created once. A listing that does not fit
        an existing category uses it and stores its own name in Products.CustomCategoryName.
     3. dbo.Products.CustomCategoryName (nvarchar(60), NULL): the seller's category text, e.g. N'Nhạc cụ'.
        CHECK: NULL, or 2-60 characters after trimming. The backend requires it exactly for a category with
        AllowsCustomName = 1 and clears it for every other category.

   Run on an isolated copy first:
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V005__other_category_custom_name.sql
            -v Approved="YES" TargetDb="<Db>" ProductionApproval="NO"
   TargetDb must equal the connected database. Running on UniMarketJava additionally needs ProductionApproval="YES".
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------- Step 0: guards and baseline ---------- */
IF '$(Approved)' <> 'YES'
BEGIN RAISERROR('V005: not approved. Pass -v Approved="YES" only after team approval.', 16, 1); SET NOEXEC ON; END
GO
IF DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V005: connected database does not match TargetDb; stopping.', 16, 1); SET NOEXEC ON; END
IF DB_NAME() = N'UniMarketJava' AND '$(ProductionApproval)' <> 'YES'
BEGIN RAISERROR('V005: UniMarketJava needs ProductionApproval="YES" (not given).', 16, 1); SET NOEXEC ON; END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V004')
BEGIN RAISERROR('V005: V004 must be applied first.', 16, 1); SET NOEXEC ON; END
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V005')
BEGIN RAISERROR('V005: already applied; it must not run twice.', 16, 1); SET NOEXEC ON; END
IF COL_LENGTH('dbo.Categories', 'AllowsCustomName') IS NOT NULL OR COL_LENGTH('dbo.Products', 'CustomCategoryName') IS NOT NULL
BEGIN RAISERROR('V005: columns already exist; stop and investigate.', 16, 1); SET NOEXEC ON; END
IF EXISTS (SELECT 1 FROM dbo.Categories WHERE Name = N'Other')
BEGIN RAISERROR('V005: a category named "Other" already exists; stop and investigate.', 16, 1); SET NOEXEC ON; END
GO

IF OBJECT_ID('tempdb..#V005Baseline') IS NOT NULL DROP TABLE #V005Baseline;
SELECT (SELECT COUNT(*) FROM dbo.Categories) AS Categories,
       (SELECT COUNT(*) FROM dbo.Products) AS Products,
       (SELECT COUNT(*) FROM dbo.Orders) AS Orders,
       (SELECT CHECKSUM_AGG(CHECKSUM(CategoryId, Name, IsActive)) FROM dbo.Categories) AS CategoriesChecksum,
       (SELECT CHECKSUM_AGG(CHECKSUM(ProductId, CategoryId, Title, Price, Status, ModerationStatus)) FROM dbo.Products) AS ProductsChecksum
INTO #V005Baseline;

BEGIN TRANSACTION;
GO

/* ---------- Step 1: category flag ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V005: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Categories ADD AllowsCustomName bit NOT NULL
    CONSTRAINT DF_Categories_AllowsCustomName DEFAULT 0;
GO

/* ---------- Step 2: listing column ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V005: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Products ADD CustomCategoryName nvarchar(60) NULL
    CONSTRAINT CK_Products_CustomCategoryName CHECK (CustomCategoryName IS NULL OR LEN(LTRIM(RTRIM(CustomCategoryName))) BETWEEN 2 AND 60);
GO

/* ---------- Step 3: the official "Other" category ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V005: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
INSERT dbo.Categories (Name, IsActive, AllowsCustomName) VALUES (N'Other', 1, 1);
GO

/* ---------- Step 4: record and verify ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V005: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
INSERT dbo.SchemaMigrations (Version, Description, AppliedAt, AppliedBy)
VALUES ('V005', N'"Other" category (Categories.AllowsCustomName) and seller-typed Products.CustomCategoryName',
        SYSUTCDATETIME(), SUSER_SNAME());

DECLARE @problems nvarchar(max) = N'';
SELECT @problems = CONCAT(@problems,
    IIF(b.Categories + 1 <> (SELECT COUNT(*) FROM dbo.Categories), N'category count; ', N''),
    IIF(b.Products <> (SELECT COUNT(*) FROM dbo.Products), N'products; ', N''),
    IIF(b.Orders <> (SELECT COUNT(*) FROM dbo.Orders), N'orders; ', N''),
    IIF(ISNULL(b.CategoriesChecksum, 0) <> ISNULL((SELECT CHECKSUM_AGG(CHECKSUM(CategoryId, Name, IsActive)) FROM dbo.Categories WHERE Name <> N'Other'), 0), N'existing categories; ', N''),
    IIF(ISNULL(b.ProductsChecksum, 0) <> ISNULL((SELECT CHECKSUM_AGG(CHECKSUM(ProductId, CategoryId, Title, Price, Status, ModerationStatus)) FROM dbo.Products), 0), N'listing rows; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Products WHERE CustomCategoryName IS NOT NULL), N'unexpected custom names; ', N''),
    IIF((SELECT COUNT(*) FROM dbo.Categories WHERE AllowsCustomName = 1) <> 1, N'"Other" flag; ', N''))
FROM #V005Baseline AS b;
IF @problems <> N''
BEGIN
    RAISERROR(N'V005 post-checks FAILED (%s). Rolling back.', 16, 1, @problems);
    IF @@TRANCOUNT > 0 ROLLBACK;
    SET NOEXEC ON;
END
GO
IF @@TRANCOUNT = 1
BEGIN
    COMMIT;
    PRINT 'V005 applied and verified: "Other" category and custom category name added, existing rows unchanged.';
END
GO
SET NOEXEC OFF;
GO
