/* =====================================================================
   V004 - Buyer / seller chat and chat reports
   ---------------------------------------------------------------------
   Rollback: database/migrations/V004_rollback.sql

   What it does (additive; V001-V003 business rules, money formulas and existing rows unchanged):
     1. dbo.Conversations: one conversation per (listing, buyer). The seller is copied from the listing when the
        conversation starts. Each side keeps the id of the last message it has read (unread counters).
     2. dbo.ConversationMessages: plain-text messages (1-2000 characters). Messages are never edited or deleted,
        so a reported conversation stays complete for the admin who reviews it.
     3. dbo.Reports.ConversationId: a report can point at a conversation. Such a report also names the other
        participant in ReportedUserId (the existing CHECK "exactly one of ProductId / ReportedUserId" is kept),
        so it goes through the existing Open -> Reviewing -> Resolved / Dismissed admin flow.

   Run on an isolated copy first:
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V004__buyer_seller_chat.sql
            -v Approved="YES" TargetDb="<Db>" ProductionApproval="NO"
   TargetDb must equal the connected database. Running on UniMarketJava additionally needs ProductionApproval="YES".
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------- Step 0: guards and baseline ---------- */
IF '$(Approved)' <> 'YES'
BEGIN RAISERROR('V004: not approved. Pass -v Approved="YES" only after team approval.', 16, 1); SET NOEXEC ON; END
GO
IF DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V004: connected database does not match TargetDb; stopping.', 16, 1); SET NOEXEC ON; END
IF DB_NAME() = N'UniMarketJava' AND '$(ProductionApproval)' <> 'YES'
BEGIN RAISERROR('V004: UniMarketJava needs ProductionApproval="YES" (not given).', 16, 1); SET NOEXEC ON; END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V003')
BEGIN RAISERROR('V004: V003 must be applied first.', 16, 1); SET NOEXEC ON; END
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V004')
BEGIN RAISERROR('V004: already applied; it must not run twice.', 16, 1); SET NOEXEC ON; END
IF OBJECT_ID('dbo.Conversations') IS NOT NULL OR OBJECT_ID('dbo.ConversationMessages') IS NOT NULL
   OR COL_LENGTH('dbo.Reports', 'ConversationId') IS NOT NULL
BEGIN RAISERROR('V004: objects already exist; stop and investigate.', 16, 1); SET NOEXEC ON; END
GO

IF OBJECT_ID('tempdb..#V004Baseline') IS NOT NULL DROP TABLE #V004Baseline;
SELECT (SELECT COUNT(*) FROM dbo.Users) AS Users,
       (SELECT COUNT(*) FROM dbo.Products) AS Products,
       (SELECT COUNT(*) FROM dbo.Orders) AS Orders,
       (SELECT COUNT(*) FROM dbo.Reports) AS Reports,
       (SELECT COALESCE(SUM(TotalAmount), 0) FROM dbo.Orders) AS OrderTotals,
       (SELECT CHECKSUM_AGG(CHECKSUM(ReportId, ReporterId, ProductId, ReportedUserId, Status)) FROM dbo.Reports) AS ReportsChecksum
INTO #V004Baseline;

BEGIN TRANSACTION;
GO

/* ---------- Step 1: conversations ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V004: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
CREATE TABLE dbo.Conversations (
    ConversationId          int IDENTITY CONSTRAINT PK_Conversations PRIMARY KEY,
    ProductId               int NOT NULL CONSTRAINT FK_Conversations_Product REFERENCES dbo.Products(ProductId),
    BuyerId                 int NOT NULL CONSTRAINT FK_Conversations_Buyer REFERENCES dbo.Users(UserId),
    SellerId                int NOT NULL CONSTRAINT FK_Conversations_Seller REFERENCES dbo.Users(UserId),
    CreatedAt               datetime2(0) NOT NULL CONSTRAINT DF_Conversations_CreatedAt DEFAULT SYSUTCDATETIME(),
    LastMessageAt           datetime2(0) NULL,
    BuyerLastReadMessageId  bigint NULL,
    SellerLastReadMessageId bigint NULL,
    CONSTRAINT UQ_Conversations_ProductBuyer UNIQUE (ProductId, BuyerId),
    CONSTRAINT CK_Conversations_Participants CHECK (BuyerId <> SellerId));
CREATE INDEX IX_Conversations_Buyer ON dbo.Conversations (BuyerId, LastMessageAt DESC);
CREATE INDEX IX_Conversations_Seller ON dbo.Conversations (SellerId, LastMessageAt DESC);
GO

/* ---------- Step 2: messages ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V004: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
CREATE TABLE dbo.ConversationMessages (
    MessageId      bigint IDENTITY CONSTRAINT PK_ConversationMessages PRIMARY KEY,
    ConversationId int NOT NULL CONSTRAINT FK_ConversationMessages_Conversation REFERENCES dbo.Conversations(ConversationId),
    SenderId       int NOT NULL CONSTRAINT FK_ConversationMessages_Sender REFERENCES dbo.Users(UserId),
    Body           nvarchar(2000) NOT NULL CONSTRAINT CK_ConversationMessages_Body CHECK (LEN(LTRIM(RTRIM(Body))) > 0),
    CreatedAt      datetime2(0) NOT NULL CONSTRAINT DF_ConversationMessages_CreatedAt DEFAULT SYSUTCDATETIME());
CREATE INDEX IX_ConversationMessages_Conversation ON dbo.ConversationMessages (ConversationId, MessageId);
GO

/* ---------- Step 3: reports about a conversation ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V004: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
ALTER TABLE dbo.Reports ADD ConversationId int NULL
    CONSTRAINT FK_Reports_Conversation REFERENCES dbo.Conversations(ConversationId);
GO
ALTER TABLE dbo.Reports ADD CONSTRAINT CK_Reports_Conversation
    CHECK (ConversationId IS NULL OR (ReportedUserId IS NOT NULL AND ProductId IS NULL));
CREATE INDEX IX_Reports_Conversation ON dbo.Reports (ConversationId) WHERE ConversationId IS NOT NULL;
GO

/* ---------- Step 4: record and verify ---------- */
IF @@TRANCOUNT <> 1 BEGIN RAISERROR('V004: no open migration transaction.', 16, 1); SET NOEXEC ON; END
GO
INSERT dbo.SchemaMigrations (Version, Description, AppliedAt, AppliedBy)
VALUES ('V004', N'Buyer / seller chat (Conversations, ConversationMessages) and reports about a conversation',
        SYSUTCDATETIME(), SUSER_SNAME());

DECLARE @problems nvarchar(max) = N'';
SELECT @problems = CONCAT(@problems,
    IIF(b.Users <> (SELECT COUNT(*) FROM dbo.Users), N'users; ', N''),
    IIF(b.Products <> (SELECT COUNT(*) FROM dbo.Products), N'products; ', N''),
    IIF(b.Orders <> (SELECT COUNT(*) FROM dbo.Orders), N'orders; ', N''),
    IIF(b.Reports <> (SELECT COUNT(*) FROM dbo.Reports), N'reports; ', N''),
    IIF(b.OrderTotals <> (SELECT COALESCE(SUM(TotalAmount), 0) FROM dbo.Orders), N'order totals; ', N''),
    IIF(ISNULL(b.ReportsChecksum, 0) <> ISNULL((SELECT CHECKSUM_AGG(CHECKSUM(ReportId, ReporterId, ProductId, ReportedUserId, Status)) FROM dbo.Reports), 0), N'report rows; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Reports WHERE ConversationId IS NOT NULL), N'unexpected conversation reports; ', N''),
    IIF(EXISTS (SELECT 1 FROM dbo.Conversations), N'unexpected conversations; ', N''))
FROM #V004Baseline AS b;
IF @problems <> N''
BEGIN
    RAISERROR(N'V004 post-checks FAILED (%s). Rolling back.', 16, 1, @problems);
    IF @@TRANCOUNT > 0 ROLLBACK;
    SET NOEXEC ON;
END
GO
IF @@TRANCOUNT = 1
BEGIN
    COMMIT;
    PRINT 'V004 applied and verified: chat tables created, existing rows unchanged.';
END
GO
SET NOEXEC OFF;
GO
