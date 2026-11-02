/* =====================================================================
   READ-ONLY. Prints a Markdown reference of the current database schema:
   tables (columns, keys, CHECK constraints, indexes), views, procedures
   with parameters, triggers and table types.
   sqlcmd -S <server> -E -C -I -d <database> -h -1 -W -y 0 -i describe_schema.sql -o SCHEMA_REFERENCE.md
   ===================================================================== */
SET NOCOUNT ON;
DECLARE @lines TABLE (Seq int IDENTITY, Line nvarchar(max));
DECLARE @version nvarchar(200) = N'unknown (no SchemaMigrations table: baseline V001)';
IF OBJECT_ID('dbo.SchemaMigrations', 'U') IS NOT NULL
    EXEC sp_executesql N'SELECT @v = STRING_AGG(Version, '', '') WITHIN GROUP (ORDER BY Version) FROM dbo.SchemaMigrations', N'@v nvarchar(200) OUTPUT', @version OUTPUT;

INSERT @lines VALUES (N'# Database schema reference'), (N''),
    (N'Generated from the live catalog by `database/schema/describe_schema.sql`. Do not edit by hand.'), (N''),
    (N'- Migrations applied: ' + @version),
    (N'- Generated (UTC): ' + CONVERT(nvarchar(30), SYSUTCDATETIME(), 120)), (N'');

DECLARE @t int, @name sysname;
DECLARE tabs CURSOR LOCAL FAST_FORWARD FOR
    SELECT object_id, name FROM sys.tables WHERE is_ms_shipped = 0 ORDER BY name;
OPEN tabs; FETCH NEXT FROM tabs INTO @t, @name;
WHILE @@FETCH_STATUS = 0
BEGIN
    INSERT @lines VALUES (N'## dbo.' + @name), (N''), (N'| Column | Type | Null | Default / computed |'), (N'|---|---|---|---|');
    INSERT @lines
    SELECT N'| ' + c.name + N' | ' + ty.name
         + CASE WHEN ty.name IN ('varchar', 'char', 'varbinary', 'binary') THEN N'(' + IIF(c.max_length = -1, N'max', CAST(c.max_length AS nvarchar)) + N')'
                WHEN ty.name IN ('nvarchar', 'nchar') THEN N'(' + IIF(c.max_length = -1, N'max', CAST(c.max_length / 2 AS nvarchar)) + N')'
                WHEN ty.name IN ('decimal', 'numeric') THEN N'(' + CAST(c.precision AS nvarchar) + N',' + CAST(c.scale AS nvarchar) + N')'
                WHEN ty.name = 'datetime2' THEN N'(' + CAST(c.scale AS nvarchar) + N')' ELSE N'' END
         + IIF(c.is_identity = 1, N' identity', N'')
         + N' | ' + IIF(c.is_nullable = 1, N'yes', N'no')
         + N' | ' + COALESCE(N'computed: `' + cc.definition + N'`' + IIF(cc.is_persisted = 1, N' persisted', N''), N'default `' + dc.definition + N'`', N'')
         + N' |'
    FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
    LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE c.object_id = @t ORDER BY c.column_id;

    INSERT @lines VALUES (N''), (N'Keys and indexes:');
    INSERT @lines
    SELECT N'- ' + CASE WHEN i.is_primary_key = 1 THEN N'PRIMARY KEY' WHEN i.is_unique_constraint = 1 THEN N'UNIQUE' WHEN i.is_unique = 1 THEN N'UNIQUE INDEX' ELSE N'INDEX' END
         + N' (' + STUFF((SELECT N', ' + COL_NAME(ic.object_id, ic.column_id) FROM sys.index_columns ic
                          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0 ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, N'') + N')'
         + IIF(i.has_filter = 1, N' WHERE ' + i.filter_definition, N'')
         + IIF(i.name LIKE N'%[_][_]%', N'', N' `' + i.name + N'`')
    FROM sys.indexes i WHERE i.object_id = @t AND i.index_id > 0
    ORDER BY i.is_primary_key DESC, i.is_unique_constraint DESC, i.name;

    INSERT @lines
    SELECT N'- FOREIGN KEY (' + STUFF((SELECT N', ' + COL_NAME(k.parent_object_id, k.parent_column_id) FROM sys.foreign_key_columns k WHERE k.constraint_object_id = fk.object_id ORDER BY k.constraint_column_id FOR XML PATH('')), 1, 2, N'')
         + N') -> ' + OBJECT_NAME(fk.referenced_object_id) + N' ('
         + STUFF((SELECT N', ' + COL_NAME(k.referenced_object_id, k.referenced_column_id) FROM sys.foreign_key_columns k WHERE k.constraint_object_id = fk.object_id ORDER BY k.constraint_column_id FOR XML PATH('')), 1, 2, N'') + N')'
    FROM sys.foreign_keys fk WHERE fk.parent_object_id = @t ORDER BY 1;

    INSERT @lines SELECT N'- CHECK `' + cc.definition + N'`' FROM sys.check_constraints cc WHERE cc.parent_object_id = @t ORDER BY cc.definition;
    INSERT @lines VALUES (N'');
    FETCH NEXT FROM tabs INTO @t, @name;
END
CLOSE tabs; DEALLOCATE tabs;

INSERT @lines VALUES (N'## Views'), (N'');
INSERT @lines SELECT N'- `dbo.' + v.name + N'`' + IIF(OBJECTPROPERTY(v.object_id, 'IsSchemaBound') = 1, N' (schema-bound, indexed)', N'')
FROM sys.views v WHERE v.is_ms_shipped = 0 ORDER BY v.name;

INSERT @lines VALUES (N''), (N'## Stored procedures'), (N'');
INSERT @lines
SELECT N'- `dbo.' + p.name + N'(' + ISNULL(STUFF((SELECT N', ' + pr.name + N' ' + TYPE_NAME(pr.user_type_id) + IIF(pr.has_default_value = 1 OR pr.is_readonly = 1, IIF(pr.is_readonly = 1, N' READONLY', N' = default'), N'')
         FROM sys.parameters pr WHERE pr.object_id = p.object_id ORDER BY pr.parameter_id FOR XML PATH('')), 1, 2, N''), N'') + N')`'
FROM sys.procedures p WHERE p.is_ms_shipped = 0 ORDER BY p.name;

INSERT @lines VALUES (N''), (N'## Triggers'), (N'');
INSERT @lines SELECT N'- `dbo.' + tr.name + N'` on ' + OBJECT_NAME(tr.parent_id) FROM sys.triggers tr WHERE tr.is_ms_shipped = 0 AND tr.parent_class = 1 ORDER BY tr.name;

INSERT @lines VALUES (N''), (N'## Table types'), (N'');
INSERT @lines SELECT N'- `dbo.' + tt.name + N'` (' + STUFF((SELECT N', ' + c.name + N' ' + TYPE_NAME(c.user_type_id) FROM sys.columns c WHERE c.object_id = tt.type_table_object_id ORDER BY c.column_id FOR XML PATH('')), 1, 2, N'') + N')'
FROM sys.table_types tt ORDER BY tt.name;
IF NOT EXISTS (SELECT 1 FROM sys.table_types) INSERT @lines VALUES (N'- none');

SELECT Line FROM @lines ORDER BY Seq;
