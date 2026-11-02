/* =====================================================================
   Creates an isolated copy of a UniMarket database for migration tests.

   - BACKUP ... WITH COPY_ONLY: a full backup that does not affect the
     source database or its backup chain. The source is only read.
   - RESTORE ... AS a NEW database with its own files.
   - Refuses to overwrite an existing database.

   sqlcmd -S <server> -E -C -b -i create_test_copy.sql
          -v SourceDb="UniMarketJava" TestDb="UniMarketJava_V002Test"
             BackupFile="C:\...\Backup\UniMarketJava_copyonly.bak"
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;

IF DB_ID(N'$(TestDb)') IS NOT NULL
    THROW 51950, 'The test database already exists. Drop it explicitly first; this script never overwrites a database.', 1;
IF N'$(TestDb)' = N'$(SourceDb)'
    THROW 51951, 'TestDb must be different from SourceDb.', 1;

BACKUP DATABASE [$(SourceDb)] TO DISK = N'$(BackupFile)'
    WITH COPY_ONLY, CHECKSUM, INIT, NAME = N'$(SourceDb) copy-only for migration tests';
RESTORE VERIFYONLY FROM DISK = N'$(BackupFile)' WITH CHECKSUM;

DECLARE @data nvarchar(260) = CONVERT(nvarchar(260), SERVERPROPERTY('InstanceDefaultDataPath'));
DECLARE @dataLogical sysname, @logLogical sysname;
DECLARE @files TABLE (LogicalName nvarchar(128), PhysicalName nvarchar(260), Type char(1), FileGroupName nvarchar(128), Size numeric(20,0),
    MaxSize numeric(20,0), FileId bigint, CreateLSN numeric(25,0), DropLSN numeric(25,0), UniqueId uniqueidentifier, ReadOnlyLSN numeric(25,0),
    ReadWriteLSN numeric(25,0), BackupSizeInBytes bigint, SourceBlockSize int, FileGroupId int, LogGroupGUID uniqueidentifier,
    DifferentialBaseLSN numeric(25,0), DifferentialBaseGUID uniqueidentifier, IsReadOnly bit, IsPresent bit, TDEThumbprint varbinary(32), SnapshotUrl nvarchar(360));
INSERT @files EXEC (N'RESTORE FILELISTONLY FROM DISK = N''$(BackupFile)''');
SELECT @dataLogical = LogicalName FROM @files WHERE Type = 'D';
SELECT @logLogical = LogicalName FROM @files WHERE Type = 'L';

DECLARE @sql nvarchar(max) = N'RESTORE DATABASE [$(TestDb)] FROM DISK = N''$(BackupFile)'' WITH CHECKSUM, '
    + N'MOVE N''' + @dataLogical + N''' TO N''' + @data + N'$(TestDb).mdf'', '
    + N'MOVE N''' + @logLogical + N''' TO N''' + @data + N'$(TestDb)_log.ldf''';
EXEC (@sql);
ALTER DATABASE [$(TestDb)] SET RECOVERY SIMPLE;
PRINT 'Test copy $(TestDb) created from $(SourceDb).';
