SET NOCOUNT ON;
-- Read-only fingerprint: schema checksum, object checksum and row count per table. Compare two runs to prove nothing changed.
-- Read-only fingerprint of UniMarketJava: schema checksum + row count per table.
SELECT 'schema' AS k, CHECKSUM_AGG(CHECKSUM(TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, IS_NULLABLE, COLUMN_DEFAULT)) AS v
FROM INFORMATION_SCHEMA.COLUMNS
UNION ALL
SELECT 'objects', CHECKSUM_AGG(CHECKSUM(name, type, modify_date)) FROM sys.objects WHERE is_ms_shipped = 0
UNION ALL
SELECT 'rows:' + t.name, SUM(p.rows)
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name
ORDER BY k;
