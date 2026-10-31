/* =====================================================================
   UniMarket - Database schema (Microsoft SQL Server)

   This script is the single source of truth for the database structure.
   Hibernate runs with ddl-auto=validate and never changes the schema.

   SAFE TO RE-RUN: it only creates objects that do not exist yet.
   It never drops or recreates existing tables or data.

   Run (Windows authentication, adjust the server name):
     sqlcmd -S localhost -E -i database\schema.sql
   ===================================================================== */

USE master;
GO

IF DB_ID(N'UniMarketDB') IS NULL
BEGIN
    CREATE DATABASE UniMarketDB;
END
GO

USE UniMarketDB;
GO

/* ---------------------------------------------------------------------
   Business tables will be added here as features are implemented.
   Follow this pattern so the script stays idempotent:

   IF OBJECT_ID(N'dbo.example_table', N'U') IS NULL
   BEGIN
       CREATE TABLE dbo.example_table (
           id          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_example_table PRIMARY KEY,
           created_at  DATETIME2(0) NOT NULL CONSTRAINT df_example_table_created_at DEFAULT SYSUTCDATETIME()
       );
   END
   GO
   --------------------------------------------------------------------- */
