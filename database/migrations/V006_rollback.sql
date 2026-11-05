/* =====================================================================
   V006 rollback - removes pickup / delivery points and order location snapshots.
   WARNING: deletes every stored pickup point, pickup instruction and delivery point (listings and orders keep
   working without them, as before V006).
     sqlcmd -S <server> -E -C -I -b -f 65001 -d <Db> -i V006_rollback.sql -v Approved="YES" TargetDb="<Db>"
   ===================================================================== */
:ON ERROR EXIT
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
IF '$(Approved)' <> 'YES' OR DB_NAME() <> N'$(TargetDb)'
BEGIN RAISERROR('V006 rollback: not approved or wrong database; nothing was changed.', 16, 1); SET NOEXEC ON; END
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE Version = 'V006')
BEGIN RAISERROR('V006 rollback: V006 is not applied.', 16, 1); SET NOEXEC ON; END
GO
BEGIN TRANSACTION;
DROP TRIGGER dbo.trg_OrderItemLocations_Immutable;
DROP TRIGGER dbo.trg_OrderLocations_Immutable;
DROP TRIGGER dbo.trg_Orders_DeliveryPoint;
DROP TRIGGER dbo.trg_OrderItems_PickupSnapshot;
ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_DeliveryPoint;
ALTER TABLE dbo.Orders DROP COLUMN DeliveryLatitude, DeliveryLongitude;
ALTER TABLE dbo.OrderItems DROP CONSTRAINT CK_OrderItems_PickupPoint;
ALTER TABLE dbo.OrderItems DROP COLUMN PickupLatitude, PickupLongitude, PickupInstructions;
ALTER TABLE dbo.Products DROP CONSTRAINT CK_Products_PickupInstructions, CK_Products_PickupPoint;
ALTER TABLE dbo.Products DROP COLUMN PickupLatitude, PickupLongitude, PickupInstructions;
DELETE dbo.SchemaMigrations WHERE Version = 'V006';
COMMIT;
PRINT 'V006 rolled back.';
GO
SET NOEXEC OFF;
GO
