/* UniMarket - SQL Server 2019+ / Java JDBC
   Sources: updated UniMarket Business Plan (2026-10-31), core transaction flow.
   Updated for frontend/backend alignment (2026-11-02).
   Fresh database only. SSMS: Query > SQLCMD Mode, then run ENTIRE file.
   No chat, meetup, COD or direct seller bank transfer.
   UTC timestamps, VND whole-unit amounts, one listing = one physical item.
   One order = one listing. Checkout multiple items calls usp_PlaceOrder once
   per selected item inside ONE Java transaction, in ascending ProductId order.
   Procedures support that outer transaction; exceptions must cause Java rollback.
   Payment/settlement records are accounting state, not actual money transfers.
   Checkout may group listings visually by seller, but each physical item remains
   one order; the Java service must use one transaction for the entire checkout.
   SQL conditions are New/Like New/Used; Java API maps NEW/LIKE_NEW/USED.
   SQL product statuses include Draft/Removed as internal values; API maps
   Available/Reserved/Sold to AVAILABLE/RESERVED/SOLD.
   Saved items, password reset, notification inbox and optional original prices
   are supported; messaging and paid refunds/disputes are out of MVP scope.
*/
:ON ERROR EXIT
USE master;
GO
IF DB_ID(N'UniMarketJava') IS NOT NULL
 THROW 51000,'UniMarketJava already exists. Stop; this installer never resets a database.',1;
CREATE DATABASE UniMarketJava;
GO
USE UniMarketJava;
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
-- MODULE 1: Account and profile. Students can both buy and sell.
CREATE TABLE dbo.Universities(
 UniversityId int IDENTITY PRIMARY KEY, Name nvarchar(200) NOT NULL,
 Code varchar(30) NOT NULL UNIQUE);
CREATE TABLE dbo.UniversityEmailDomains(
 Domain varchar(150) PRIMARY KEY,
 UniversityId int NOT NULL REFERENCES dbo.Universities(UniversityId));
CREATE TABLE dbo.Campuses(
 CampusId int IDENTITY PRIMARY KEY,
 UniversityId int NOT NULL REFERENCES dbo.Universities(UniversityId),
 Name nvarchar(150) NOT NULL, Address nvarchar(500) NULL,
 UNIQUE(UniversityId,Name));
CREATE TABLE dbo.Users(
 UserId int IDENTITY PRIMARY KEY,
 Email varchar(254) NOT NULL UNIQUE,
 PasswordHash varchar(255) NOT NULL,
 FullName nvarchar(150) NOT NULL, Phone varchar(20) NULL,
 ZaloUrl nvarchar(500) NULL, ShowContact bit NOT NULL DEFAULT 0,
 AvatarUrl nvarchar(1000) NULL,
 CampusId int NOT NULL REFERENCES dbo.Campuses(CampusId),
 Role varchar(10) NOT NULL DEFAULT 'Student' CHECK(Role IN('Student','Admin')),
 Status varchar(12) NOT NULL DEFAULT 'Active' CHECK(Status IN('Active','Suspended','Closed')),
 EmailVerifiedAt datetime2(0) NULL,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 UpdatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 CHECK(LEN(PasswordHash)>=20), CHECK(Email LIKE '%_@_%._%'));
CREATE TABLE dbo.EmailVerificationTokens(
 TokenId bigint IDENTITY PRIMARY KEY,
 UserId int NOT NULL REFERENCES dbo.Users(UserId),
 TokenHash binary(32) NOT NULL UNIQUE,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 ExpiresAt datetime2(0) NOT NULL, ConsumedAt datetime2(0) NULL,
 CHECK(ExpiresAt>CreatedAt));
CREATE TABLE dbo.UserAddresses(
 AddressId int IDENTITY PRIMARY KEY,
 UserId int NOT NULL REFERENCES dbo.Users(UserId),
 RecipientName nvarchar(150) NOT NULL, Phone varchar(20) NOT NULL,
 AddressLine nvarchar(500) NOT NULL, IsDefault bit NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX UX_DefaultAddress ON dbo.UserAddresses(UserId) WHERE IsDefault=1;
-- MODULE 2: Listings and images. Use soft removal instead of deleting sold items.
CREATE TABLE dbo.Categories(
 CategoryId int IDENTITY PRIMARY KEY, Name nvarchar(100) NOT NULL UNIQUE,
 IsActive bit NOT NULL DEFAULT 1);
CREATE TABLE dbo.Products(
 ProductId int IDENTITY PRIMARY KEY,
 SellerId int NOT NULL REFERENCES dbo.Users(UserId),
 CategoryId int NOT NULL REFERENCES dbo.Categories(CategoryId),
 CampusId int NOT NULL REFERENCES dbo.Campuses(CampusId),
 Title nvarchar(200) NOT NULL, Description nvarchar(max) NOT NULL,
 Condition varchar(10) NOT NULL CHECK(Condition IN('New','Like New','Used')),
 Price decimal(18,0) NOT NULL CHECK(Price>0),
 OriginalPrice decimal(18,0) NULL,
 CHECK(OriginalPrice IS NULL OR OriginalPrice>=Price),
 Status varchar(12) NOT NULL DEFAULT 'Draft'
  CHECK(Status IN('Draft','Available','Reserved','Sold','Removed')),
 ModerationStatus varchar(10) NOT NULL DEFAULT 'Approved'
  CHECK(ModerationStatus IN('Pending','Approved','Rejected')),
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 UpdatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 Version rowversion);
CREATE TABLE dbo.ProductImages(
 ImageId int IDENTITY PRIMARY KEY,
 ProductId int NOT NULL REFERENCES dbo.Products(ProductId),
 ImageUrl nvarchar(1000) NOT NULL,
 SortOrder int NOT NULL DEFAULT 0 CHECK(SortOrder>=0),
 UNIQUE(ProductId,SortOrder));
-- MODULE 3: A single item can occur once in a buyer's cart; no quantity column.
CREATE TABLE dbo.CartItems(
 UserId int NOT NULL REFERENCES dbo.Users(UserId),
 ProductId int NOT NULL REFERENCES dbo.Products(ProductId),
 AddedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 PRIMARY KEY(UserId,ProductId));
-- Buyer wishlist / Saved Items; no row should be interpreted as an order.
CREATE TABLE dbo.Favorites(
 UserId int NOT NULL REFERENCES dbo.Users(UserId),
 ProductId int NOT NULL REFERENCES dbo.Products(ProductId),
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 PRIMARY KEY(UserId,ProductId));
CREATE INDEX IX_Favorites_Product ON dbo.Favorites(ProductId);
-- Password resets use single-use random tokens. The Java service must hash the
-- token and send it by email; never store plaintext tokens or passwords.
CREATE TABLE dbo.PasswordResetTokens(
 TokenId bigint IDENTITY PRIMARY KEY,
 UserId int NOT NULL REFERENCES dbo.Users(UserId),
 TokenHash binary(32) NOT NULL UNIQUE,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 ExpiresAt datetime2(0) NOT NULL,
 ConsumedAt datetime2(0) NULL,
 CHECK(ExpiresAt>CreatedAt));
CREATE INDEX IX_ResetTokens_User ON dbo.PasswordResetTokens(UserId,ExpiresAt);
-- Lightweight, persistent, one-way notifications (not chat / direct messaging).
-- Create notifications from Java in the same transaction as a business event.
CREATE TABLE dbo.Notifications(
 NotificationId bigint IDENTITY PRIMARY KEY,
 UserId int NOT NULL REFERENCES dbo.Users(UserId),
 EventType varchar(40) NOT NULL,
 Title nvarchar(200) NOT NULL,
 Body nvarchar(1000) NULL,
 ReferenceType varchar(20) NULL,
 ReferenceId bigint NULL,
 IsRead bit NOT NULL DEFAULT 0,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 ReadAt datetime2(0) NULL,
 CHECK(LEN(LTRIM(RTRIM(EventType)))>0),
 CHECK((ReferenceType IS NULL AND ReferenceId IS NULL) OR
       (ReferenceType IS NOT NULL AND ReferenceId IS NOT NULL)),
 CHECK((IsRead=0 AND ReadAt IS NULL) OR (IsRead=1 AND ReadAt IS NOT NULL)));
CREATE INDEX IX_Notifications_User ON dbo.Notifications(UserId,IsRead,CreatedAt DESC);
-- MODULE 4: Immutable price/address snapshots protect historical orders.
CREATE TABLE dbo.Orders(
 OrderId bigint IDENTITY PRIMARY KEY,
 ProductId int NOT NULL REFERENCES dbo.Products(ProductId),
 BuyerId int NOT NULL REFERENCES dbo.Users(UserId),
 SellerId int NOT NULL REFERENCES dbo.Users(UserId),
 ProductTitle nvarchar(200) NOT NULL,
 ItemPrice decimal(18,0) NOT NULL CHECK(ItemPrice>0),
 ShippingFee decimal(18,0) NOT NULL DEFAULT 0 CHECK(ShippingFee>=0),
 TotalAmount AS CONVERT(decimal(18,0),ItemPrice+ShippingFee) PERSISTED,
 CommissionRate decimal(5,4) NOT NULL DEFAULT 0.03 CHECK(CommissionRate=0.03),
 CommissionAmount AS CONVERT(decimal(18,0),ROUND(ItemPrice*CommissionRate,0)) PERSISTED,
 SellerProceeds AS CONVERT(decimal(18,0),ItemPrice-ROUND(ItemPrice*CommissionRate,0)) PERSISTED,
 RecipientName nvarchar(150) NOT NULL, RecipientPhone varchar(20) NOT NULL,
 DeliveryAddress nvarchar(500) NOT NULL,
 PaymentProvider varchar(10) NOT NULL CHECK(PaymentProvider IN('MoMo','ZaloPay')),
 Status varchar(20) NOT NULL DEFAULT 'Pending'
  CHECK(Status IN('Pending','AwaitingPayment','Paid','Delivering','Completed','Cancelled')),
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 ConfirmBy datetime2(0) NOT NULL DEFAULT DATEADD(hour,24,SYSUTCDATETIME()),
 ConfirmedAt datetime2(0) NULL, PaidAt datetime2(0) NULL,
 ShippedAt datetime2(0) NULL, CompletedAt datetime2(0) NULL,
 CancelledAt datetime2(0) NULL, CancellationReason nvarchar(500) NULL,
 CHECK(BuyerId<>SellerId), CHECK(ConfirmBy>CreatedAt),
 CHECK((Status='Pending' AND ConfirmedAt IS NULL AND PaidAt IS NULL AND CompletedAt IS NULL AND CancelledAt IS NULL)
 OR (Status='AwaitingPayment' AND ConfirmedAt IS NOT NULL AND PaidAt IS NULL AND CompletedAt IS NULL AND CancelledAt IS NULL)
 OR (Status='Paid' AND ConfirmedAt IS NOT NULL AND PaidAt IS NOT NULL AND ShippedAt IS NULL AND CompletedAt IS NULL AND CancelledAt IS NULL)
 OR (Status='Delivering' AND ConfirmedAt IS NOT NULL AND PaidAt IS NOT NULL AND ShippedAt IS NOT NULL AND CompletedAt IS NULL AND CancelledAt IS NULL)
 OR (Status='Completed' AND ConfirmedAt IS NOT NULL AND PaidAt IS NOT NULL AND ShippedAt IS NOT NULL AND CompletedAt IS NOT NULL AND CancelledAt IS NULL)
 OR (Status='Cancelled' AND PaidAt IS NULL AND CompletedAt IS NULL AND CancelledAt IS NOT NULL)));
CREATE UNIQUE INDEX UX_ProductOccupied ON dbo.Orders(ProductId) WHERE Status<>'Cancelled';
CREATE TABLE dbo.OrderStatusHistory(
 HistoryId bigint IDENTITY PRIMARY KEY,
 OrderId bigint NOT NULL REFERENCES dbo.Orders(OrderId),
 Status varchar(20) NOT NULL,
 ChangedBy int NULL REFERENCES dbo.Users(UserId),
 Note nvarchar(500) NULL, ChangedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME());
CREATE TABLE dbo.Payments(
 PaymentId bigint IDENTITY PRIMARY KEY,
 OrderId bigint NOT NULL REFERENCES dbo.Orders(OrderId),
 Provider varchar(10) NOT NULL CHECK(Provider IN('MoMo','ZaloPay')),
 RequestKey varchar(100) NOT NULL UNIQUE,
 ProviderReference varchar(150) NULL,
 Amount decimal(18,0) NOT NULL CHECK(Amount>0),
 Status varchar(10) NOT NULL DEFAULT 'Pending' CHECK(Status IN('Pending','Failed','Succeeded')),
 IsSandbox bit NOT NULL DEFAULT 1,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 FinishedAt datetime2(0) NULL,
 CHECK((Status='Pending' AND FinishedAt IS NULL) OR (Status<>'Pending' AND FinishedAt IS NOT NULL)));
CREATE UNIQUE INDEX UX_PaymentReference ON dbo.Payments(Provider,ProviderReference) WHERE ProviderReference IS NOT NULL;
CREATE UNIQUE INDEX UX_SuccessfulPayment ON dbo.Payments(OrderId) WHERE Status='Succeeded';
CREATE UNIQUE INDEX UX_PendingPayment ON dbo.Payments(OrderId) WHERE Status='Pending';
CREATE TABLE dbo.Deliveries(
 OrderId bigint PRIMARY KEY REFERENCES dbo.Orders(OrderId),
 Carrier nvarchar(100) NOT NULL, TrackingNumber varchar(100) NOT NULL,
 ShippedAt datetime2(0) NOT NULL, ReceivedAt datetime2(0) NULL);
CREATE TABLE dbo.SellerSettlements(
 OrderId bigint PRIMARY KEY REFERENCES dbo.Orders(OrderId),
 SellerId int NOT NULL REFERENCES dbo.Users(UserId),
 Amount decimal(18,0) NOT NULL CHECK(Amount>=0),
 Status varchar(10) NOT NULL DEFAULT 'Pending' CHECK(Status IN('Pending','Released')),
 IsSandbox bit NOT NULL DEFAULT 1,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 ReleasedAt datetime2(0) NULL,
 CHECK((Status='Pending' AND ReleasedAt IS NULL) OR (Status='Released' AND ReleasedAt IS NOT NULL)));
-- MODULE 5: Reviews in both directions; exactly one per participant/order.
CREATE TABLE dbo.Reviews(
 ReviewId bigint IDENTITY PRIMARY KEY,
 OrderId bigint NOT NULL REFERENCES dbo.Orders(OrderId),
 ReviewerId int NOT NULL REFERENCES dbo.Users(UserId),
 RevieweeId int NOT NULL REFERENCES dbo.Users(UserId),
 Rating tinyint NOT NULL CHECK(Rating BETWEEN 1 AND 5),
 Comment nvarchar(2000) NULL, IsHidden bit NOT NULL DEFAULT 0,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(OrderId,ReviewerId), CHECK(ReviewerId<>RevieweeId));
CREATE TABLE dbo.Reports(
 ReportId bigint IDENTITY PRIMARY KEY,
 ReporterId int NOT NULL REFERENCES dbo.Users(UserId),
 ProductId int NULL REFERENCES dbo.Products(ProductId),
 ReportedUserId int NULL REFERENCES dbo.Users(UserId),
 Reason nvarchar(2000) NOT NULL CHECK(LEN(LTRIM(RTRIM(Reason)))>0),
 Status varchar(10) NOT NULL DEFAULT 'Open' CHECK(Status IN('Open','Reviewing','Resolved','Dismissed')),
 ResolvedBy int NULL REFERENCES dbo.Users(UserId), Resolution nvarchar(2000) NULL,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(), ResolvedAt datetime2(0) NULL,
 CHECK((ProductId IS NOT NULL AND ReportedUserId IS NULL) OR (ProductId IS NULL AND ReportedUserId IS NOT NULL)),
 CHECK((Status IN('Open','Reviewing') AND ResolvedBy IS NULL AND ResolvedAt IS NULL)
 OR (Status IN('Resolved','Dismissed') AND ResolvedBy IS NOT NULL AND ResolvedAt IS NOT NULL)));
CREATE TABLE dbo.AdminActions(
 ActionId bigint IDENTITY PRIMARY KEY,
 AdminId int NOT NULL REFERENCES dbo.Users(UserId), Action nvarchar(100) NOT NULL,
 EntityType varchar(30) NOT NULL, EntityId bigint NOT NULL, Reason nvarchar(1000) NULL,
 CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME());
-- Optional paid featured listings from the updated Business Plan, not required by main flow.
-- Packages: 24h = 5,000 VND; 3 days = 15,000; 7 days = 30,000.
-- Advertising sponsorships are a FUTURE revenue stream (no ad table in MVP).
CREATE TABLE dbo.PromotionPackages(
 PackageId int IDENTITY PRIMARY KEY, Name nvarchar(100) NOT NULL,
 DurationHours int NOT NULL CHECK(DurationHours>0), Price decimal(18,0) NOT NULL CHECK(Price>0));
CREATE TABLE dbo.ProductPromotions(
 PromotionId bigint IDENTITY PRIMARY KEY,
 ProductId int NOT NULL REFERENCES dbo.Products(ProductId),
 PackageId int NOT NULL REFERENCES dbo.PromotionPackages(PackageId),
 Amount decimal(18,0) NOT NULL CHECK(Amount>0),
 Provider varchar(10) NOT NULL CHECK(Provider IN('MoMo','ZaloPay')),
 RequestKey varchar(100) NOT NULL UNIQUE, ProviderReference varchar(150) NULL,
 Status varchar(10) NOT NULL DEFAULT 'Pending' CHECK(Status IN('Pending','Failed','Paid')),
 StartsAt datetime2(0) NULL, EndsAt datetime2(0) NULL, IsSandbox bit NOT NULL DEFAULT 1,
 CHECK((Status='Paid' AND StartsAt IS NOT NULL AND EndsAt>StartsAt)
 OR (Status IN('Pending','Failed') AND StartsAt IS NULL AND EndsAt IS NULL)));
CREATE UNIQUE INDEX UX_PromotionReference ON dbo.ProductPromotions(Provider,ProviderReference) WHERE ProviderReference IS NOT NULL;
CREATE INDEX IX_ProductSearch ON dbo.Products(Status,ModerationStatus,CampusId,CategoryId,Condition,Price) INCLUDE(Title,SellerId,CreatedAt);
CREATE INDEX IX_SellerProducts ON dbo.Products(SellerId,Status);
CREATE INDEX IX_BuyerOrders ON dbo.Orders(BuyerId,CreatedAt DESC);
CREATE INDEX IX_SellerOrders ON dbo.Orders(SellerId,Status,CreatedAt DESC);
CREATE INDEX IX_Reviews ON dbo.Reviews(RevieweeId,IsHidden) INCLUDE(Rating);
CREATE INDEX IX_PaymentOrder ON dbo.Payments(OrderId,Status);
COMMIT;
GO
CREATE VIEW dbo.vw_UserRatings AS
 SELECT RevieweeId AS UserId, COUNT(*) AS ReviewCount,
 CAST(AVG(CAST(Rating AS decimal(5,2))) AS decimal(3,2)) AS AverageRating
 FROM dbo.Reviews WHERE IsHidden=0 GROUP BY RevieweeId;
GO
CREATE VIEW dbo.vw_PublicProfiles AS
 SELECT u.UserId,u.FullName,u.AvatarUrl,u.CampusId,u.EmailVerifiedAt,
 CASE WHEN u.ShowContact=1 THEN u.Phone END AS Phone,
 CASE WHEN u.ShowContact=1 THEN u.ZaloUrl END AS ZaloUrl,
 COALESCE(r.ReviewCount,0) AS ReviewCount,r.AverageRating
 FROM dbo.Users u LEFT JOIN dbo.vw_UserRatings r ON r.UserId=u.UserId
 WHERE u.Status='Active';
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
CREATE VIEW dbo.vw_AdminDashboard AS
 SELECT (SELECT COUNT(*) FROM dbo.Users WHERE Role='Student') AS Students,
 (SELECT COUNT(*) FROM dbo.Products WHERE Status='Available') AS AvailableProducts,
 (SELECT COUNT(*) FROM dbo.Orders WHERE Status='Completed') AS CompletedOrders,
 (SELECT COUNT(*) FROM dbo.Reports WHERE Status IN('Open','Reviewing')) AS OpenReports,
 (SELECT COALESCE(SUM(CommissionAmount),0) FROM dbo.Orders WHERE Status='Completed') AS CommissionRevenue;
GO
CREATE TRIGGER dbo.trg_Reviews_Validate ON dbo.Reviews AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.Orders o ON o.OrderId=i.OrderId
 WHERE o.Status<>'Completed' OR NOT((i.ReviewerId=o.BuyerId AND i.RevieweeId=o.SellerId)
 OR (i.ReviewerId=o.SellerId AND i.RevieweeId=o.BuyerId)))
 THROW 51001,'Only participants may review each other after completion.',1;
END;
GO
CREATE TRIGGER dbo.trg_Cart_Validate ON dbo.CartItems AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.Products p ON p.ProductId=i.ProductId
 WHERE p.SellerId=i.UserId OR p.Status<>'Available' OR p.ModerationStatus<>'Approved')
 THROW 51002,'Cannot add own or unavailable listing to cart.',1;
END;
GO
-- Account verification: Java checks email domain/university at registration,
-- sends random token, stores SHA-256 digest only and passes digest here.
CREATE PROCEDURE dbo.usp_VerifyEmail @TokenHash binary(32) AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @UserId int;
 SELECT @UserId=UserId FROM dbo.EmailVerificationTokens WITH(UPDLOCK,HOLDLOCK)
 WHERE TokenHash=@TokenHash AND ConsumedAt IS NULL AND ExpiresAt>SYSUTCDATETIME();
 IF @UserId IS NULL THROW 51003,'Invalid or expired verification token.',1;
 UPDATE dbo.EmailVerificationTokens SET ConsumedAt=SYSUTCDATETIME() WHERE TokenHash=@TokenHash;
 UPDATE dbo.Users SET EmailVerifiedAt=COALESCE(EmailVerifiedAt,SYSUTCDATETIME()),UpdatedAt=SYSUTCDATETIME() WHERE UserId=@UserId;
 COMMIT;
 END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
CREATE PROCEDURE dbo.usp_PlaceOrder
 @BuyerId int,@ProductId int,@PaymentProvider varchar(10),
 @RecipientName nvarchar(150),@RecipientPhone varchar(20),@DeliveryAddress nvarchar(500),
 @ShippingFee decimal(18,0)=0 AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 IF NOT EXISTS(SELECT 1 FROM dbo.Users WHERE UserId=@BuyerId AND Status='Active' AND EmailVerifiedAt IS NOT NULL)
 THROW 51004,'An active verified buyer is required.',1;
 IF NULLIF(LTRIM(RTRIM(@RecipientName)),N'') IS NULL OR NULLIF(LTRIM(RTRIM(@RecipientPhone)),'') IS NULL
 OR NULLIF(LTRIM(RTRIM(@DeliveryAddress)),N'') IS NULL THROW 51005,'Delivery information is required.',1;
 DECLARE @SellerId int,@Price decimal(18,0),@Title nvarchar(200),@OrderId bigint;
 SELECT @SellerId=p.SellerId,@Price=p.Price,@Title=p.Title
 FROM dbo.Products p WITH(UPDLOCK,HOLDLOCK)
 WHERE p.ProductId=@ProductId AND p.Status='Available' AND p.ModerationStatus='Approved'
 AND EXISTS(SELECT 1 FROM dbo.Users u WHERE u.UserId=p.SellerId AND u.Status='Active' AND u.EmailVerifiedAt IS NOT NULL)
 AND EXISTS(SELECT 1 FROM dbo.Categories c WHERE c.CategoryId=p.CategoryId AND c.IsActive=1);
 IF @SellerId IS NULL OR @SellerId=@BuyerId THROW 51006,'Listing unavailable or belongs to buyer.',1;
 INSERT dbo.Orders(ProductId,BuyerId,SellerId,ProductTitle,ItemPrice,ShippingFee,RecipientName,RecipientPhone,DeliveryAddress,PaymentProvider)
 VALUES(@ProductId,@BuyerId,@SellerId,@Title,@Price,@ShippingFee,@RecipientName,@RecipientPhone,@DeliveryAddress,@PaymentProvider);
 SET @OrderId=SCOPE_IDENTITY();
 UPDATE dbo.Products SET Status='Reserved',UpdatedAt=SYSUTCDATETIME() WHERE ProductId=@ProductId;
 DELETE dbo.CartItems WHERE UserId=@BuyerId AND ProductId=@ProductId;
 INSERT dbo.OrderStatusHistory(OrderId,Status,ChangedBy) VALUES(@OrderId,'Pending',@BuyerId);
 COMMIT;
 SELECT @OrderId AS OrderId;
 END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
CREATE PROCEDURE dbo.usp_ConfirmOrder @OrderId bigint,@SellerId int AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 UPDATE dbo.Orders WITH(UPDLOCK) SET Status='AwaitingPayment',ConfirmedAt=SYSUTCDATETIME()
 WHERE OrderId=@OrderId AND SellerId=@SellerId AND Status='Pending' AND ConfirmBy>SYSUTCDATETIME()
 AND EXISTS(SELECT 1 FROM dbo.Users WHERE UserId=@SellerId AND Status='Active');
 IF @@ROWCOUNT<>1 THROW 51007,'Order cannot be confirmed by this seller or deadline has passed.',1;
 INSERT dbo.OrderStatusHistory(OrderId,Status,ChangedBy) VALUES(@OrderId,'AwaitingPayment',@SellerId);
 COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
-- Create an attempt first; provider failure can be retried with a NEW RequestKey.
CREATE PROCEDURE dbo.usp_StartPayment @OrderId bigint,@BuyerId int,@RequestKey varchar(100),@IsSandbox bit=1 AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @Amount decimal(18,0),@Provider varchar(10);
 SELECT @Amount=TotalAmount,@Provider=PaymentProvider FROM dbo.Orders WITH(UPDLOCK,HOLDLOCK)
 WHERE OrderId=@OrderId AND BuyerId=@BuyerId AND Status='AwaitingPayment';
 IF @Amount IS NULL THROW 51008,'Payment requires the buyer of an awaiting-payment order.',1;
 INSERT dbo.Payments(OrderId,Provider,RequestKey,Amount,IsSandbox) VALUES(@OrderId,@Provider,@RequestKey,@Amount,@IsSandbox);
 DECLARE @Id bigint=SCOPE_IDENTITY(); COMMIT; SELECT @Id AS PaymentId;
 END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
-- ONLY trusted Java callback code may invoke this AFTER signature, provider,
-- request/order identity, currency VND and amount have been verified.
CREATE PROCEDURE dbo.usp_RecordPaymentResult
 @RequestKey varchar(100),@ProviderReference varchar(150),@Amount decimal(18,0),@Success bit AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @OrderId bigint,@Status varchar(20),@PaymentStatus varchar(10),@Expected decimal(18,0),@ExistingRef varchar(150);
 SELECT @OrderId=OrderId FROM dbo.Payments WHERE RequestKey=@RequestKey;
 IF @OrderId IS NULL THROW 51009,'Unknown payment request.',1;
 SELECT @Status=Status,@Expected=TotalAmount FROM dbo.Orders WITH(UPDLOCK,HOLDLOCK) WHERE OrderId=@OrderId;
 SELECT @PaymentStatus=Status,@ExistingRef=ProviderReference FROM dbo.Payments WITH(UPDLOCK,HOLDLOCK) WHERE RequestKey=@RequestKey;
 IF @Amount<>@Expected OR NULLIF(@ProviderReference,'') IS NULL THROW 51010,'Payment amount/reference mismatch.',1;
 IF @PaymentStatus<>'Pending'
 BEGIN
  IF @ExistingRef=@ProviderReference AND ((@PaymentStatus='Succeeded' AND @Success=1) OR (@PaymentStatus='Failed' AND @Success=0))
  BEGIN COMMIT; RETURN; END;
  THROW 51011,'Conflicting duplicate callback.',1;
 END;
 IF @Status<>'AwaitingPayment' THROW 51012,'Order is not awaiting payment.',1;
 UPDATE dbo.Payments SET Status=CASE WHEN @Success=1 THEN 'Succeeded' ELSE 'Failed' END,
 ProviderReference=@ProviderReference,FinishedAt=SYSUTCDATETIME() WHERE RequestKey=@RequestKey;
 IF @Success=1
 BEGIN
  UPDATE dbo.Orders SET Status='Paid',PaidAt=SYSUTCDATETIME() WHERE OrderId=@OrderId;
  INSERT dbo.OrderStatusHistory(OrderId,Status,Note) VALUES(@OrderId,'Paid',N'Verified online payment result');
 END;
 COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
CREATE PROCEDURE dbo.usp_ShipOrder @OrderId bigint,@SellerId int,@Carrier nvarchar(100),@TrackingNumber varchar(100) AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 IF NULLIF(LTRIM(RTRIM(@Carrier)),N'') IS NULL OR NULLIF(LTRIM(RTRIM(@TrackingNumber)),'') IS NULL
 THROW 51013,'Carrier and tracking number required.',1;
 UPDATE dbo.Orders WITH(UPDLOCK) SET Status='Delivering',ShippedAt=SYSUTCDATETIME()
 WHERE OrderId=@OrderId AND SellerId=@SellerId AND Status='Paid';
 IF @@ROWCOUNT<>1 THROW 51014,'Only seller may ship a paid order.',1;
 INSERT dbo.Deliveries(OrderId,Carrier,TrackingNumber,ShippedAt) VALUES(@OrderId,@Carrier,@TrackingNumber,SYSUTCDATETIME());
 INSERT dbo.OrderStatusHistory(OrderId,Status,ChangedBy) VALUES(@OrderId,'Delivering',@SellerId);
 COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
CREATE PROCEDURE dbo.usp_CompleteOrder @OrderId bigint,@BuyerId int AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @ProductId int,@SellerId int,@Amount decimal(18,0),@Sandbox bit;
 SELECT @ProductId=ProductId,@SellerId=SellerId,@Amount=SellerProceeds
 FROM dbo.Orders WITH(UPDLOCK,HOLDLOCK) WHERE OrderId=@OrderId AND BuyerId=@BuyerId AND Status='Delivering';
 IF @ProductId IS NULL THROW 51015,'Only buyer may confirm receipt of a delivering order.',1;
 SELECT @Sandbox=IsSandbox FROM dbo.Payments WHERE OrderId=@OrderId AND Status='Succeeded';
 IF @Sandbox IS NULL THROW 51016,'Successful payment is required.',1;
 UPDATE dbo.Orders SET Status='Completed',CompletedAt=SYSUTCDATETIME() WHERE OrderId=@OrderId;
 UPDATE dbo.Deliveries SET ReceivedAt=SYSUTCDATETIME() WHERE OrderId=@OrderId;
 UPDATE dbo.Products SET Status='Sold',UpdatedAt=SYSUTCDATETIME() WHERE ProductId=@ProductId;
 INSERT dbo.SellerSettlements(OrderId,SellerId,Amount,IsSandbox) VALUES(@OrderId,@SellerId,@Amount,@Sandbox);
 INSERT dbo.OrderStatusHistory(OrderId,Status,ChangedBy) VALUES(@OrderId,'Completed',@BuyerId);
 COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
-- Disbursement integration calls this ONLY after successful external transfer.
CREATE PROCEDURE dbo.usp_MarkSettlementReleased @OrderId bigint AS
BEGIN
 SET NOCOUNT ON;
 UPDATE dbo.SellerSettlements SET Status='Released',ReleasedAt=SYSUTCDATETIME()
 WHERE OrderId=@OrderId AND Status='Pending';
 IF @@ROWCOUNT<>1 THROW 51017,'Settlement not pending.',1;
END;
GO
-- Unpaid cancellation only. Do not cancel while provider result is unresolved.
-- Paid-order refunds/disputes require a separate future workflow.
CREATE PROCEDURE dbo.usp_CancelOrder @OrderId bigint,@ActorId int,@Reason nvarchar(500) AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @ProductId int;
 SELECT @ProductId=ProductId FROM dbo.Orders WITH(UPDLOCK,HOLDLOCK)
 WHERE OrderId=@OrderId AND Status IN('Pending','AwaitingPayment')
 AND (@ActorId IN(BuyerId,SellerId) OR EXISTS(SELECT 1 FROM dbo.Users WHERE UserId=@ActorId AND Role='Admin' AND Status='Active'));
 IF @ProductId IS NULL THROW 51018,'Only participants/admin may cancel an unpaid order.',1;
 IF EXISTS(SELECT 1 FROM dbo.Payments WHERE OrderId=@OrderId AND Status='Pending')
 THROW 51019,'Resolve pending gateway attempt before cancellation.',1;
 UPDATE dbo.Orders SET Status='Cancelled',CancelledAt=SYSUTCDATETIME(),CancellationReason=@Reason WHERE OrderId=@OrderId;
 UPDATE dbo.Products SET Status='Available',UpdatedAt=SYSUTCDATETIME() WHERE ProductId=@ProductId AND Status='Reserved';
 INSERT dbo.OrderStatusHistory(OrderId,Status,ChangedBy,Note) VALUES(@OrderId,'Cancelled',@ActorId,@Reason);
 COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
-- Schedule this from Java (e.g. every minute), also before pending-order pages.
CREATE PROCEDURE dbo.usp_ExpirePendingOrders AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @Expired TABLE(OrderId bigint,ProductId int);
 UPDATE dbo.Orders WITH(UPDLOCK) SET Status='Cancelled',CancelledAt=SYSUTCDATETIME(),CancellationReason=N'Confirmation deadline exceeded'
 OUTPUT inserted.OrderId,inserted.ProductId INTO @Expired
 WHERE Status='Pending' AND ConfirmBy<=SYSUTCDATETIME();
 UPDATE p SET Status='Available',UpdatedAt=SYSUTCDATETIME() FROM dbo.Products p JOIN @Expired e ON e.ProductId=p.ProductId WHERE p.Status='Reserved';
 INSERT dbo.OrderStatusHistory(OrderId,Status,Note) SELECT OrderId,'Cancelled',N'24-hour seller confirmation timeout' FROM @Expired;
 COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;
END;
GO
-- Base lookup data. Fictional demo accounts/listings follow below.
-- OriginalPrice remains NULL for demo items without a verified reference price;
-- the UI must not invent percentage-off labels.
INSERT dbo.Universities(Name,Code) VALUES(N'FPT University','FPT');
INSERT dbo.UniversityEmailDomains(Domain,UniversityId) VALUES('fpt.edu.vn',1);
INSERT dbo.Campuses(UniversityId,Name,Address) VALUES(1,N'FPT Hoa Lac',N'Hoa Lac, Ha Noi');
INSERT dbo.Categories(Name) VALUES
 (N'Textbooks'),(N'Electronics'),(N'Dormitory items'),(N'Fashion'),
 (N'Study equipment'),(N'Sports'),(N'Bikes & Ride');
-- 'More' in the frontend is a navigation shortcut, not a database category.
INSERT dbo.PromotionPackages(Name,DurationHours,Price) VALUES(N'24-hour boost',24,5000),(N'Featured 3 days',72,15000),(N'Featured 7 days',168,30000);
GO

-- BEGIN FULL STUDENT MARKETPLACE DEMO DATA
-- Fictional assignment demo data. All accounts use BCrypt password UniMarket@123.
-- Local/sandbox use only. Images are supplied SVG demo illustrations, not item photographs.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF EXISTS(SELECT 1 FROM dbo.Users WHERE Email LIKE 'demo.%@fpt.edu.vn') THROW 51100,'Demo users already exist; no rows were changed.',1;
DECLARE @Campus int=(SELECT TOP(1) CampusId FROM dbo.Campuses WHERE Name=N'FPT Hoa Lac');
IF @Campus IS NULL THROW 51101,'Install the schema and base lookup data first.',1;
DECLARE @Users TABLE(N int PRIMARY KEY,UserId int);
DECLARE @Products TABLE(N int PRIMARY KEY,ProductId int);
DECLARE @uid int,@pid int;
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,CampusId,Role,EmailVerifiedAt) VALUES('demo.admin@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Quản trị UniMarket Demo','0000000000',@Campus,'Admin',SYSUTCDATETIME());
DECLARE @Admin int=CONVERT(int,SCOPE_IDENTITY());
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student01@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Nguyễn Minh An','0000000001',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(1,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Nguyễn Minh An','0000000001',N'Địa chỉ minh họa 1, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student02@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Trần Thu Hà','0000000002',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(2,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Trần Thu Hà','0000000002',N'Địa chỉ minh họa 2, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student03@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Lê Hoàng Nam','0000000003',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(3,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Lê Hoàng Nam','0000000003',N'Địa chỉ minh họa 3, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student04@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Phạm Ngọc Linh','0000000004',NULL,0,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(4,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Phạm Ngọc Linh','0000000004',N'Địa chỉ minh họa 4, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student05@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Vũ Đức Anh','0000000005',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(5,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Vũ Đức Anh','0000000005',N'Địa chỉ minh họa 5, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student06@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Đỗ Mai Chi','0000000006',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(6,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Đỗ Mai Chi','0000000006',N'Địa chỉ minh họa 6, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student07@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Bùi Quang Huy','0000000007',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(7,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Bùi Quang Huy','0000000007',N'Địa chỉ minh họa 7, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student08@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Hoàng Yến Nhi','0000000008',NULL,0,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(8,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Hoàng Yến Nhi','0000000008',N'Địa chỉ minh họa 8, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student09@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Đặng Trung Kiên','0000000009',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(9,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Đặng Trung Kiên','0000000009',N'Địa chỉ minh họa 9, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student10@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Ngô Phương Thảo','0000000010',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(10,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Ngô Phương Thảo','0000000010',N'Địa chỉ minh họa 10, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student11@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Dương Tuấn Minh','0000000011',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(11,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Dương Tuấn Minh','0000000011',N'Địa chỉ minh họa 11, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student12@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Lý Thanh Trúc','0000000012',NULL,0,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(12,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Lý Thanh Trúc','0000000012',N'Địa chỉ minh họa 12, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student13@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Trịnh Hải Đăng','0000000013',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(13,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Trịnh Hải Đăng','0000000013',N'Địa chỉ minh họa 13, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student14@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Đinh Bảo Ngọc','0000000014',NULL,1,@Campus,SYSUTCDATETIME(),'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(14,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Đinh Bảo Ngọc','0000000014',N'Địa chỉ minh họa 14, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student15@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Hồ Nhật Long','0000000015',NULL,1,@Campus,NULL,'Active');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(15,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Hồ Nhật Long','0000000015',N'Địa chỉ minh họa 15, Thạch Thất, Hà Nội',1);
INSERT dbo.Users(Email,PasswordHash,FullName,Phone,ZaloUrl,ShowContact,CampusId,EmailVerifiedAt,Status) VALUES('demo.student16@fpt.edu.vn','$2a$10$/zA/oHwtfyFO6jDEzfj8zuXiBB5qvrm9JeU44Ul.9LQCVCf5WrlJa',N'Tạ Khánh Vy','0000000016',NULL,0,@Campus,SYSUTCDATETIME(),'Suspended');
SET @uid=SCOPE_IDENTITY(); INSERT @Users VALUES(16,@uid);
INSERT dbo.UserAddresses(UserId,RecipientName,Phone,AddressLine,IsDefault) VALUES(@uid,N'Tạ Khánh Vy','0000000016',N'Địa chỉ minh họa 16, Thạch Thất, Hà Nội',1);
INSERT dbo.EmailVerificationTokens(UserId,TokenHash,ExpiresAt) SELECT UserId,HASHBYTES('SHA2_256','DEMO-ONLY-EMAIL-TOKEN-15'),DATEADD(hour,24,SYSUTCDATETIME()) FROM @Users WHERE N=15;
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giáo trình Java cơ bản',N'Giáo trình Java cơ bản — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',65000,'Available','Approved',DATEADD(day,-1,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=1 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(1,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-01-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-01-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giáo trình SQL Server',N'Giáo trình SQL Server — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',80000,'Available','Approved',DATEADD(day,-2,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=2 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(2,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-02-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-02-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Sách Clean Code bản tiếng Anh',N'Sách Clean Code bản tiếng Anh — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',120000,'Available','Approved',DATEADD(day,-3,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=3 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(3,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-03-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-03-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bộ đề IELTS Cambridge 16',N'Bộ đề IELTS Cambridge 16 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',95000,'Available','Approved',DATEADD(day,-4,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=4 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(4,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-04-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-04-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giáo trình Calculus 1',N'Giáo trình Calculus 1 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',70000,'Available','Approved',DATEADD(day,-5,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=5 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(5,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-05-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-05-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Sách nhập môn Marketing',N'Sách nhập môn Marketing — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',55000,'Available','Approved',DATEADD(day,-6,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=6 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(6,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-06-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-06-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giáo trình kinh tế vi mô',N'Giáo trình kinh tế vi mô — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',50000,'Available','Approved',DATEADD(day,-7,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=7 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(7,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-07-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-07-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Sách tiếng Nhật Minna N5',N'Sách tiếng Nhật Minna N5 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',90000,'Available','Approved',DATEADD(day,-8,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=8 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(8,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-08-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-08-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Sách Data Structures and Algorithms',N'Sách Data Structures and Algorithms — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',110000,'Available','Approved',DATEADD(day,-9,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=9 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(9,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-09-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-09-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bộ sách tiếng Anh giao tiếp',N'Bộ sách tiếng Anh giao tiếp — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',85000,'Available','Approved',DATEADD(day,-10,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=10 AND c.Name=N'Textbooks';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(10,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-10-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-10-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bàn phím Logitech K380',N'Bàn phím Logitech K380 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',320000,'Available','Approved',DATEADD(day,-11,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=11 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(11,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-11-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-11-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Chuột Logitech M331',N'Chuột Logitech M331 — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',150000,'Available','Approved',DATEADD(day,-12,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=12 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(12,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-12-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-12-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Màn hình Dell 24 inch',N'Màn hình Dell 24 inch — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',1450000,'Available','Approved',DATEADD(day,-13,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=1 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(13,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-13-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-13-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Laptop ThinkPad T480',N'Laptop ThinkPad T480 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',4800000,'Available','Approved',DATEADD(day,-14,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=2 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(14,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-14-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-14-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Tai nghe Sony WH-CH510',N'Tai nghe Sony WH-CH510 — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',450000,'Available','Approved',DATEADD(day,-15,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=3 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(15,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-15-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-15-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Loa Bluetooth JBL Go 3',N'Loa Bluetooth JBL Go 3 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',500000,'Available','Approved',DATEADD(day,-16,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=4 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(16,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-16-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-16-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Ổ cứng SSD Kingston 240GB',N'Ổ cứng SSD Kingston 240GB — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',280000,'Available','Approved',DATEADD(day,-17,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=5 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(17,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-17-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-17-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Webcam Logitech C270',N'Webcam Logitech C270 — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',230000,'Available','Approved',DATEADD(day,-18,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=6 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(18,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-18-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-18-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Đèn màn hình Xiaomi',N'Đèn màn hình Xiaomi — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',400000,'Available','Approved',DATEADD(day,-19,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=7 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(19,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-19-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-19-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Hub USB-C 5 trong 1',N'Hub USB-C 5 trong 1 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',190000,'Available','Approved',DATEADD(day,-20,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=8 AND c.Name=N'Electronics';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(20,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-20-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-20-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Quạt bàn Senko',N'Quạt bàn Senko — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',180000,'Available','Approved',DATEADD(day,-0,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=9 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(21,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-21-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-21-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Đèn bàn học LED',N'Đèn bàn học LED — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',95000,'Available','Approved',DATEADD(day,-1,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=10 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(22,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-22-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-22-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Kệ sách 3 tầng',N'Kệ sách 3 tầng — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',140000,'Available','Approved',DATEADD(day,-2,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=11 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(23,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-23-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-23-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bàn học gấp gọn',N'Bàn học gấp gọn — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',160000,'Available','Approved',DATEADD(day,-3,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=12 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(24,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-24-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-24-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Ghế tựa học bài',N'Ghế tựa học bài — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',220000,'Available','Approved',DATEADD(day,-4,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=1 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(25,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-25-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-25-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Nồi cơm điện mini',N'Nồi cơm điện mini — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',200000,'Available','Approved',DATEADD(day,-5,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=2 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(26,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-26-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-26-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Ấm siêu tốc Sunhouse',N'Ấm siêu tốc Sunhouse — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',110000,'Available','Approved',DATEADD(day,-6,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=3 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(27,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-27-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-27-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giá treo quần áo',N'Giá treo quần áo — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',90000,'Available','Approved',DATEADD(day,-7,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=4 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(28,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-28-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-28-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Thùng đựng đồ có nắp',N'Thùng đựng đồ có nắp — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',45000,'Available','Approved',DATEADD(day,-8,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=5 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(29,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-29-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-29-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Gương đứng ký túc xá',N'Gương đứng ký túc xá — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',130000,'Available','Approved',DATEADD(day,-9,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=6 AND c.Name=N'Dormitory items';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(30,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-30-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-30-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Áo khoác denim unisex size M',N'Áo khoác denim unisex size M — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',150000,'Available','Approved',DATEADD(day,-10,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=7 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(31,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-31-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-31-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Balo đi học chống nước',N'Balo đi học chống nước — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',180000,'Available','Approved',DATEADD(day,-11,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=8 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(32,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-32-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-32-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giày thể thao size 40',N'Giày thể thao size 40 — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',250000,'Available','Approved',DATEADD(day,-12,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=9 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(33,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-33-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-33-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Áo sơ mi trắng size L',N'Áo sơ mi trắng size L — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',80000,'Available','Approved',DATEADD(day,-13,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=10 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(34,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-34-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-34-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Túi tote vải canvas',N'Túi tote vải canvas — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',40000,'Available','Approved',DATEADD(day,-14,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=11 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(35,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-35-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-35-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Áo hoodie xám size M',N'Áo hoodie xám size M — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',140000,'Available','Approved',DATEADD(day,-15,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=12 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(36,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-36-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-36-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Quần jeans xanh size 30',N'Quần jeans xanh size 30 — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',120000,'Available','Approved',DATEADD(day,-16,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=1 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(37,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-37-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-37-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Mũ lưỡi trai màu đen',N'Mũ lưỡi trai màu đen — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',45000,'Available','Approved',DATEADD(day,-17,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=2 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(38,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-38-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-38-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Áo polo nam size L',N'Áo polo nam size L — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',90000,'Available','Approved',DATEADD(day,-18,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=3 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(39,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-39-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-39-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Áo cardigan nữ size S',N'Áo cardigan nữ size S — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',110000,'Available','Approved',DATEADD(day,-19,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=4 AND c.Name=N'Fashion';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(40,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-40-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-40-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Máy tính Casio fx-580VN X',N'Máy tính Casio fx-580VN X — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',350000,'Available','Approved',DATEADD(day,-20,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=5 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(41,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-41-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-41-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bảng vẽ Wacom One Small',N'Bảng vẽ Wacom One Small — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',650000,'Available','Approved',DATEADD(day,-0,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=6 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(42,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-42-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-42-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Giá đỡ laptop nhôm',N'Giá đỡ laptop nhôm — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',120000,'Available','Approved',DATEADD(day,-1,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=7 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(43,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-43-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-43-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bộ dụng cụ vẽ kỹ thuật',N'Bộ dụng cụ vẽ kỹ thuật — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',85000,'Available','Approved',DATEADD(day,-2,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=8 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(44,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-44-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-44-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bảng trắng mini A3',N'Bảng trắng mini A3 — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',65000,'Available','Approved',DATEADD(day,-3,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=9 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(45,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-45-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-45-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Đế tản nhiệt laptop',N'Đế tản nhiệt laptop — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',130000,'Available','Pending',DATEADD(day,-4,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=10 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(46,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-46-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-46-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Sổ tay ghi chép chưa dùng',N'Sổ tay ghi chép chưa dùng — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',25000,'Available','Pending',DATEADD(day,-5,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=11 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(47,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-47-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-47-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bút trình chiếu slide',N'Bút trình chiếu slide — đồ dùng sinh viên thanh lý. Chưa qua sử dụng, không còn nhu cầu dùng. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','New',110000,'Draft','Approved',DATEADD(day,-6,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=12 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(48,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-48-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-48-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Bộ thước hình học',N'Bộ thước hình học — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Used',30000,'Removed','Rejected',DATEADD(day,-7,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=1 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(49,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-49-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-49-detail.svg',1);
INSERT dbo.Products(SellerId,CategoryId,CampusId,Title,Description,Condition,Price,Status,ModerationStatus,CreatedAt) SELECT u.UserId,c.CategoryId,@Campus,N'Đồng hồ Pomodoro để bàn',N'Đồng hồ Pomodoro để bàn — đồ dùng sinh viên thanh lý. Hoạt động bình thường, có dấu hiệu sử dụng nhẹ. Xem kỹ ảnh và mô tả trước khi mua. Giao hàng sau khi thanh toán online. Dữ liệu minh họa cho đồ án.','Like New',80000,'Available','Approved',DATEADD(day,-8,SYSUTCDATETIME()) FROM @Users u CROSS JOIN dbo.Categories c WHERE u.N=2 AND c.Name=N'Study equipment';
SET @pid=SCOPE_IDENTITY(); INSERT @Products VALUES(50,@pid);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-50-front.svg',0);
INSERT dbo.ProductImages(ProductId,ImageUrl,SortOrder) VALUES(@pid,N'images/demo/products/item-50-detail.svg',1);
DECLARE @buyer int,@seller int,@order bigint,@amount decimal(18,0); DECLARE @result TABLE(OrderId bigint);
DECLARE @provider varchar(10),@request varchar(100); 
-- Demo order 01: Completed
SELECT @pid=ProductId FROM @Products WHERE N=1; SELECT @buyer=UserId FROM @Users WHERE N=2;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'MoMo',N'Trần Thu Hà','0000000002',N'Địa chỉ giao hàng minh họa 2, Hà Nội',15000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-failed-01',1;
EXEC dbo.usp_RecordPaymentResult 'demo-failed-01','demo-fail-ref-01',@amount,0;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-01',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-01','demo-paid-ref-01',@amount,1;
EXEC dbo.usp_ShipOrder @order,@seller,N'Đơn vị giao hàng Demo','DEMO-TRACK-001';
EXEC dbo.usp_CompleteOrder @order,@buyer;
INSERT dbo.Reviews(OrderId,ReviewerId,RevieweeId,Rating,Comment) VALUES(@order,@buyer,@seller,5,N'Sản phẩm đúng mô tả, người bán đóng gói cẩn thận.'),(@order,@seller,@buyer,5,N'Người mua xác nhận nhận hàng nhanh, giao dịch thuận lợi.');
EXEC dbo.usp_MarkSettlementReleased @order;
-- Demo order 02: Completed
SELECT @pid=ProductId FROM @Products WHERE N=2; SELECT @buyer=UserId FROM @Users WHERE N=3;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'ZaloPay',N'Lê Hoàng Nam','0000000003',N'Địa chỉ giao hàng minh họa 3, Hà Nội',25000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-02',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-02','demo-paid-ref-02',@amount,1;
EXEC dbo.usp_ShipOrder @order,@seller,N'Đơn vị giao hàng Demo','DEMO-TRACK-002';
EXEC dbo.usp_CompleteOrder @order,@buyer;
INSERT dbo.Reviews(OrderId,ReviewerId,RevieweeId,Rating,Comment) VALUES(@order,@buyer,@seller,5,N'Sản phẩm đúng mô tả, người bán đóng gói cẩn thận.'),(@order,@seller,@buyer,5,N'Người mua xác nhận nhận hàng nhanh, giao dịch thuận lợi.');
EXEC dbo.usp_MarkSettlementReleased @order;
-- Demo order 03: Completed
SELECT @pid=ProductId FROM @Products WHERE N=3; SELECT @buyer=UserId FROM @Users WHERE N=4;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'MoMo',N'Phạm Ngọc Linh','0000000004',N'Địa chỉ giao hàng minh họa 4, Hà Nội',15000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-03',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-03','demo-paid-ref-03',@amount,1;
EXEC dbo.usp_ShipOrder @order,@seller,N'Đơn vị giao hàng Demo','DEMO-TRACK-003';
EXEC dbo.usp_CompleteOrder @order,@buyer;
INSERT dbo.Reviews(OrderId,ReviewerId,RevieweeId,Rating,Comment) VALUES(@order,@buyer,@seller,4,N'Sản phẩm đúng mô tả, người bán đóng gói cẩn thận.'),(@order,@seller,@buyer,5,N'Người mua xác nhận nhận hàng nhanh, giao dịch thuận lợi.');
EXEC dbo.usp_MarkSettlementReleased @order;
-- Demo order 04: Completed
SELECT @pid=ProductId FROM @Products WHERE N=4; SELECT @buyer=UserId FROM @Users WHERE N=5;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'ZaloPay',N'Vũ Đức Anh','0000000005',N'Địa chỉ giao hàng minh họa 5, Hà Nội',25000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-04',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-04','demo-paid-ref-04',@amount,1;
EXEC dbo.usp_ShipOrder @order,@seller,N'Đơn vị giao hàng Demo','DEMO-TRACK-004';
EXEC dbo.usp_CompleteOrder @order,@buyer;
INSERT dbo.Reviews(OrderId,ReviewerId,RevieweeId,Rating,Comment) VALUES(@order,@buyer,@seller,5,N'Sản phẩm đúng mô tả, người bán đóng gói cẩn thận.'),(@order,@seller,@buyer,5,N'Người mua xác nhận nhận hàng nhanh, giao dịch thuận lợi.');
-- Demo order 05: Delivering
SELECT @pid=ProductId FROM @Products WHERE N=5; SELECT @buyer=UserId FROM @Users WHERE N=6;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'MoMo',N'Đỗ Mai Chi','0000000006',N'Địa chỉ giao hàng minh họa 6, Hà Nội',15000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-05',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-05','demo-paid-ref-05',@amount,1;
EXEC dbo.usp_ShipOrder @order,@seller,N'Đơn vị giao hàng Demo','DEMO-TRACK-005';
-- Demo order 06: Delivering
SELECT @pid=ProductId FROM @Products WHERE N=6; SELECT @buyer=UserId FROM @Users WHERE N=7;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'ZaloPay',N'Bùi Quang Huy','0000000007',N'Địa chỉ giao hàng minh họa 7, Hà Nội',25000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-06',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-06','demo-paid-ref-06',@amount,1;
EXEC dbo.usp_ShipOrder @order,@seller,N'Đơn vị giao hàng Demo','DEMO-TRACK-006';
-- Demo order 07: Paid
SELECT @pid=ProductId FROM @Products WHERE N=7; SELECT @buyer=UserId FROM @Users WHERE N=8;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'MoMo',N'Hoàng Yến Nhi','0000000008',N'Địa chỉ giao hàng minh họa 8, Hà Nội',15000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-07',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-07','demo-paid-ref-07',@amount,1;
-- Demo order 08: Paid
SELECT @pid=ProductId FROM @Products WHERE N=8; SELECT @buyer=UserId FROM @Users WHERE N=9;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'ZaloPay',N'Đặng Trung Kiên','0000000009',N'Địa chỉ giao hàng minh họa 9, Hà Nội',25000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-paid-08',1;
EXEC dbo.usp_RecordPaymentResult 'demo-paid-08','demo-paid-ref-08',@amount,1;
-- Demo order 09: AwaitingPayment
SELECT @pid=ProductId FROM @Products WHERE N=9; SELECT @buyer=UserId FROM @Users WHERE N=10;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'MoMo',N'Ngô Phương Thảo','0000000010',N'Địa chỉ giao hàng minh họa 10, Hà Nội',15000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
-- Demo order 10: AwaitingPayment
SELECT @pid=ProductId FROM @Products WHERE N=10; SELECT @buyer=UserId FROM @Users WHERE N=11;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'ZaloPay',N'Dương Tuấn Minh','0000000011',N'Địa chỉ giao hàng minh họa 11, Hà Nội',25000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_ConfirmOrder @order,@seller;
SELECT @amount=TotalAmount FROM dbo.Orders WHERE OrderId=@order;
EXEC dbo.usp_StartPayment @order,@buyer,'demo-failed-10',1;
EXEC dbo.usp_RecordPaymentResult 'demo-failed-10','demo-fail-ref-10',@amount,0;
-- Demo order 11: Pending
SELECT @pid=ProductId FROM @Products WHERE N=11; SELECT @buyer=UserId FROM @Users WHERE N=12;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'MoMo',N'Lý Thanh Trúc','0000000012',N'Địa chỉ giao hàng minh họa 12, Hà Nội',15000;
SELECT @order=OrderId FROM @result;
-- Demo order 12: Cancelled
SELECT @pid=ProductId FROM @Products WHERE N=12; SELECT @buyer=UserId FROM @Users WHERE N=1;
SELECT @seller=SellerId FROM dbo.Products WHERE ProductId=@pid; DELETE @result;
INSERT @result EXEC dbo.usp_PlaceOrder @buyer,@pid,'ZaloPay',N'Nguyễn Minh An','0000000001',N'Địa chỉ giao hàng minh họa 1, Hà Nội',25000;
SELECT @order=OrderId FROM @result;
EXEC dbo.usp_CancelOrder @order,@seller,N'Người bán không còn sản phẩm, hủy trước thanh toán.';
-- Saved carts use available items from other sellers only.
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=21 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=1 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=31 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=1 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=22 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=2 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=32 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=2 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=23 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=3 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=33 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=3 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=24 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=4 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=34 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=4 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=25 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=5 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=35 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=5 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=26 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=6 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=36 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=6 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=27 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=7 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=37 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=7 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=28 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=8 AND u.UserId<>p.SellerId;
INSERT dbo.CartItems(UserId,ProductId) SELECT u.UserId,p.ProductId FROM @Users u JOIN @Products m ON m.N=38 JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE u.N=8 AND u.UserId<>p.SellerId;
INSERT dbo.ProductPromotions(ProductId,PackageId,Amount,Provider,RequestKey,ProviderReference,Status,StartsAt,EndsAt,IsSandbox) SELECT p.ProductId,k.PackageId,k.Price,'MoMo','demo-promo-1','demo-promo-ref-1','Paid',DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(hour,k.DurationHours-1,SYSUTCDATETIME()),1 FROM @Products p CROSS JOIN dbo.PromotionPackages k WHERE p.N=13 AND k.Name=N'24-hour boost';
INSERT dbo.ProductPromotions(ProductId,PackageId,Amount,Provider,RequestKey,ProviderReference,Status,StartsAt,EndsAt,IsSandbox) SELECT p.ProductId,k.PackageId,k.Price,'MoMo','demo-promo-2','demo-promo-ref-2','Paid',DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(hour,k.DurationHours-1,SYSUTCDATETIME()),1 FROM @Products p CROSS JOIN dbo.PromotionPackages k WHERE p.N=14 AND k.Name=N'Featured 3 days';
INSERT dbo.ProductPromotions(ProductId,PackageId,Amount,Provider,RequestKey,ProviderReference,Status,StartsAt,EndsAt,IsSandbox) SELECT p.ProductId,k.PackageId,k.Price,'MoMo','demo-promo-3','demo-promo-ref-3','Paid',DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(hour,k.DurationHours-1,SYSUTCDATETIME()),1 FROM @Products p CROSS JOIN dbo.PromotionPackages k WHERE p.N=15 AND k.Name=N'Featured 7 days';
INSERT dbo.ProductPromotions(ProductId,PackageId,Amount,Provider,RequestKey,ProviderReference,Status,StartsAt,EndsAt,IsSandbox) SELECT p.ProductId,k.PackageId,k.Price,'MoMo','demo-promo-4','demo-promo-ref-4','Paid',DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(hour,k.DurationHours-1,SYSUTCDATETIME()),1 FROM @Products p CROSS JOIN dbo.PromotionPackages k WHERE p.N=16 AND k.Name=N'24-hour boost';
INSERT dbo.ProductPromotions(ProductId,PackageId,Amount,Provider,RequestKey,ProviderReference,Status,StartsAt,EndsAt,IsSandbox) SELECT p.ProductId,k.PackageId,k.Price,'MoMo','demo-promo-5','demo-promo-ref-5','Paid',DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(hour,k.DurationHours-1,SYSUTCDATETIME()),1 FROM @Products p CROSS JOIN dbo.PromotionPackages k WHERE p.N=17 AND k.Name=N'Featured 3 days';
INSERT dbo.ProductPromotions(ProductId,PackageId,Amount,Provider,RequestKey,ProviderReference,Status,StartsAt,EndsAt,IsSandbox) SELECT p.ProductId,k.PackageId,k.Price,'MoMo','demo-promo-6','demo-promo-ref-6','Paid',DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(hour,k.DurationHours-1,SYSUTCDATETIME()),1 FROM @Products p CROSS JOIN dbo.PromotionPackages k WHERE p.N=18 AND k.Name=N'Featured 7 days';
INSERT dbo.Reports(ReporterId,ProductId,Reason) SELECT u.UserId,p.ProductId,N'Ảnh chưa thể hiện rõ tình trạng sản phẩm.' FROM @Users u CROSS JOIN @Products p WHERE u.N=1 AND p.N=46;
INSERT dbo.Reports(ReporterId,ProductId,Reason) SELECT u.UserId,p.ProductId,N'Mô tả giá bán cần được kiểm tra lại.' FROM @Users u CROSS JOIN @Products p WHERE u.N=2 AND p.N=47;
INSERT dbo.Reports(ReporterId,ProductId,Reason) SELECT u.UserId,p.ProductId,N'Danh mục sản phẩm có thể chưa phù hợp.' FROM @Users u CROSS JOIN @Products p WHERE u.N=3 AND p.N=48;
INSERT dbo.Reports(ReporterId,ProductId,Reason) SELECT u.UserId,p.ProductId,N'Nội dung tin đăng cần bổ sung thông tin.' FROM @Users u CROSS JOIN @Products p WHERE u.N=4 AND p.N=49;
INSERT dbo.Reports(ReporterId,ReportedUserId,Reason,Status,ResolvedBy,Resolution,ResolvedAt) SELECT a.UserId,b.UserId,N'Tài khoản đăng nội dung không phù hợp.','Resolved',@Admin,N'Đã xem xét và tạm khóa tài khoản minh họa.',SYSUTCDATETIME() FROM @Users a CROSS JOIN @Users b WHERE a.N=2 AND b.N=16;
INSERT dbo.Reports(ReporterId,ReportedUserId,Reason,Status,ResolvedBy,Resolution,ResolvedAt) SELECT a.UserId,b.UserId,N'Yêu cầu kiểm tra thông tin tài khoản.','Dismissed',@Admin,N'Chưa có bằng chứng vi phạm.',SYSUTCDATETIME() FROM @Users a CROSS JOIN @Users b WHERE a.N=3 AND b.N=8;
INSERT dbo.AdminActions(AdminId,Action,EntityType,EntityId,Reason) SELECT @Admin,N'Suspend account','User',UserId,N'Tài khoản demo dùng để kiểm thử trạng thái bị khóa.' FROM @Users WHERE N=16;
INSERT dbo.AdminActions(AdminId,Action,EntityType,EntityId,Reason) SELECT @Admin,N'Reject listing','Product',ProductId,N'Tin đăng demo bị từ chối để kiểm thử quản trị.' FROM @Products WHERE N=49;
IF (SELECT COUNT(*) FROM @Products)<>50 THROW 51102,'Demo product count mismatch.',1;
COMMIT;
END TRY
BEGIN CATCH
IF @@TRANCOUNT>0 ROLLBACK;
THROW;
END CATCH;
GO
