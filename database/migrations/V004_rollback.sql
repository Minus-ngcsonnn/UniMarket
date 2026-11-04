/* =====================================================================
   V004 rollback - removes buyer / seller chat and chat reports.
   WARNING: deletes every conversation, message and report about a conversation.
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V004_rollback.sql -v Approved="YES" TargetDb="<Db>"
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
IF '$(Approved)' <> 'YES' OR DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V004 rollback: not approved or wrong database; nothing was changed.', 16, 1); SET NOEXEC ON; END
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V004')
BEGIN RAISERROR('V004 rollback: V004 is not applied.', 16, 1); SET NOEXEC ON; END
GO
BEGIN TRANSACTION;
DELETE dbo.Reports WHERE ConversationId IS NOT NULL;
DROP INDEX IX_Reports_Conversation ON dbo.Reports;
ALTER TABLE dbo.Reports DROP CONSTRAINT CK_Reports_Conversation;
ALTER TABLE dbo.Reports DROP CONSTRAINT FK_Reports_Conversation;
ALTER TABLE dbo.Reports DROP COLUMN ConversationId;
DROP TABLE dbo.ConversationMessages;
DROP TABLE dbo.Conversations;
DELETE dbo.SchemaMigrations WHERE Version = 'V004';
COMMIT;
PRINT 'V004 rolled back.';
GO
SET NOEXEC OFF;
GO
