# Database schema reference

Generated from the live catalog by `database/schema/describe_schema.sql`. Do not edit by hand.

- Migrations applied: V001, V002
- Generated (UTC): 2026-11-02 10:44:59

## dbo.AdminActions

| Column | Type | Null | Default / computed |
|---|---|---|---|
| ActionId | bigint identity | no |  |
| AdminId | int | no |  |
| Action | nvarchar(100) | no |  |
| EntityType | varchar(30) | no |  |
| EntityId | bigint | no |  |
| Reason | nvarchar(1000) | yes |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (ActionId)
- FOREIGN KEY (AdminId) -> Users (UserId)

## dbo.Campuses

| Column | Type | Null | Default / computed |
|---|---|---|---|
| CampusId | int identity | no |  |
| UniversityId | int | no |  |
| Name | nvarchar(150) | no |  |
| Address | nvarchar(500) | yes |  |

Keys and indexes:
- PRIMARY KEY (CampusId)
- UNIQUE (UniversityId, Name)
- FOREIGN KEY (UniversityId) -> Universities (UniversityId)

## dbo.CartItems

| Column | Type | Null | Default / computed |
|---|---|---|---|
| UserId | int | no |  |
| ProductId | int | no |  |
| AddedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (UserId, ProductId)
- FOREIGN KEY (ProductId) -> Products (ProductId)
- FOREIGN KEY (UserId) -> Users (UserId)

## dbo.Categories

| Column | Type | Null | Default / computed |
|---|---|---|---|
| CategoryId | int identity | no |  |
| Name | nvarchar(100) | no |  |
| IsActive | bit | no | default `((1))` |

Keys and indexes:
- PRIMARY KEY (CategoryId)
- UNIQUE (Name)

## dbo.Deliveries

| Column | Type | Null | Default / computed |
|---|---|---|---|
| OrderId | bigint | no |  |
| Carrier | nvarchar(100) | yes |  |
| TrackingNumber | varchar(100) | yes |  |
| ShippedAt | datetime2(0) | no |  |
| ReceivedAt | datetime2(0) | yes |  |

Keys and indexes:
- PRIMARY KEY (OrderId)
- FOREIGN KEY (OrderId) -> Orders (OrderId)

## dbo.EmailVerificationTokens

| Column | Type | Null | Default / computed |
|---|---|---|---|
| TokenId | bigint identity | no |  |
| UserId | int | no |  |
| TokenHash | binary(32) | no |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| ExpiresAt | datetime2(0) | no |  |
| ConsumedAt | datetime2(0) | yes |  |

Keys and indexes:
- PRIMARY KEY (TokenId)
- UNIQUE (TokenHash)
- FOREIGN KEY (UserId) -> Users (UserId)
- CHECK `([ExpiresAt]>[CreatedAt])`

## dbo.Favorites

| Column | Type | Null | Default / computed |
|---|---|---|---|
| UserId | int | no |  |
| ProductId | int | no |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (UserId, ProductId)
- INDEX (ProductId) `IX_Favorites_Product`
- FOREIGN KEY (ProductId) -> Products (ProductId)
- FOREIGN KEY (UserId) -> Users (UserId)

## dbo.Notifications

| Column | Type | Null | Default / computed |
|---|---|---|---|
| NotificationId | bigint identity | no |  |
| UserId | int | no |  |
| EventType | varchar(40) | no |  |
| Title | nvarchar(200) | no |  |
| Body | nvarchar(1000) | yes |  |
| ReferenceType | varchar(20) | yes |  |
| ReferenceId | bigint | yes |  |
| IsRead | bit | no | default `((0))` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| ReadAt | datetime2(0) | yes |  |

Keys and indexes:
- PRIMARY KEY (NotificationId)
- INDEX (UserId, IsRead, CreatedAt) `IX_Notifications_User`
- FOREIGN KEY (UserId) -> Users (UserId)
- CHECK `([IsRead]=(0) AND [ReadAt] IS NULL OR [IsRead]=(1) AND [ReadAt] IS NOT NULL)`
- CHECK `([ReferenceType] IS NULL AND [ReferenceId] IS NULL OR [ReferenceType] IS NOT NULL AND [ReferenceId] IS NOT NULL)`
- CHECK `(len(ltrim(rtrim([EventType])))>(0))`

## dbo.OrderDisputes

| Column | Type | Null | Default / computed |
|---|---|---|---|
| DisputeId | bigint identity | no |  |
| OrderId | bigint | no |  |
| OpenedBy | int | no |  |
| Reason | nvarchar(2000) | no |  |
| Status | varchar(10) | no | default `('Open')` |
| Decision | varchar(20) | yes |  |
| Resolution | nvarchar(2000) | yes |  |
| ResolvedBy | int | yes |  |
| ResolvedAt | datetime2(0) | yes |  |
| RefundReference | nvarchar(100) | yes |  |
| RefundConfirmedBy | int | yes |  |
| RefundConfirmedAt | datetime2(0) | yes |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (DisputeId) `PK_OrderDisputes`
- UNIQUE INDEX (OrderId) WHERE ([Status]='Open') `UX_OrderDisputes_OneOpen`
- FOREIGN KEY (OpenedBy) -> Users (UserId)
- FOREIGN KEY (OrderId) -> Orders (OrderId)
- FOREIGN KEY (RefundConfirmedBy) -> Users (UserId)
- FOREIGN KEY (ResolvedBy) -> Users (UserId)
- CHECK `([Decision]='RefundApproved' OR [Decision]='NoRefund')`
- CHECK `([RefundReference] IS NULL AND [RefundConfirmedBy] IS NULL AND [RefundConfirmedAt] IS NULL OR [Decision]='RefundApproved' AND [RefundReference] IS NOT NULL AND [RefundConfirmedBy] IS NOT NULL AND [RefundConfirmedAt] IS NOT NULL)`
- CHECK `([Status]='Open' AND [Decision] IS NULL AND [ResolvedBy] IS NULL AND [ResolvedAt] IS NULL OR [Status]='Resolved' AND [Decision] IS NOT NULL AND [ResolvedBy] IS NOT NULL AND [ResolvedAt] IS NOT NULL)`
- CHECK `([Status]='Resolved' OR [Status]='Open')`
- CHECK `(len(ltrim(rtrim([Reason])))>(0))`

## dbo.OrderItems

| Column | Type | Null | Default / computed |
|---|---|---|---|
| OrderItemId | bigint identity | no |  |
| OrderId | bigint | no |  |
| SellerId | int | no |  |
| ProductId | int | no |  |
| ProductTitle | nvarchar(200) | no |  |
| UnitPrice | decimal(18,0) | no |  |
| Quantity | int | no | default `((1))` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (OrderItemId) `PK_OrderItems`
- UNIQUE (OrderId, ProductId) `UQ_OrderItems_Order_Product`
- INDEX (ProductId) `IX_OrderItems_Product`
- FOREIGN KEY (OrderId, SellerId) -> Orders (OrderId, SellerId)
- FOREIGN KEY (ProductId, SellerId) -> Products (ProductId, SellerId)
- CHECK `([Quantity]=(1))`
- CHECK `([UnitPrice]>(0))`

## dbo.Orders

| Column | Type | Null | Default / computed |
|---|---|---|---|
| OrderId | bigint identity | no |  |
| BuyerId | int | no |  |
| SellerId | int | no |  |
| ShippingFee | decimal(18,0) | no | default `((0))` |
| CommissionRate | decimal(5,4) | no | default `((0.03))` |
| RecipientName | nvarchar(150) | no |  |
| RecipientPhone | varchar(20) | no |  |
| DeliveryAddress | nvarchar(500) | no |  |
| PaymentProvider | varchar(10) | yes |  |
| Status | varchar(20) | no | default `('Pending')` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| ConfirmBy | datetime2(0) | no | default `(dateadd(hour,(24),sysutcdatetime()))` |
| ConfirmedAt | datetime2(0) | yes |  |
| PaidAt | datetime2(0) | yes |  |
| ShippedAt | datetime2(0) | yes |  |
| CompletedAt | datetime2(0) | yes |  |
| CancelledAt | datetime2(0) | yes |  |
| CancellationReason | nvarchar(500) | yes |  |
| Subtotal | decimal(18,0) | no |  |
| TotalAmount | decimal(18,0) | yes | computed: `(CONVERT([decimal](18,0),[Subtotal]+[ShippingFee]))` persisted |
| CommissionAmount | decimal(18,0) | yes | computed: `(CONVERT([decimal](18,0),round([Subtotal]*[CommissionRate],(0))))` persisted |
| SellerProceeds | decimal(18,0) | yes | computed: `(CONVERT([decimal](18,0),[Subtotal]-round([Subtotal]*[CommissionRate],(0))))` persisted |
| PaymentDueAt | datetime2(0) | yes | computed: `(dateadd(hour,(24),[ConfirmedAt]))` persisted |
| SellerPayoutTotal | decimal(18,0) | yes | computed: `(CONVERT([decimal](18,0),([Subtotal]-round([Subtotal]*[CommissionRate],(0)))+[ShippingFee]))` persisted |

Keys and indexes:
- PRIMARY KEY (OrderId)
- UNIQUE (OrderId, SellerId) `UQ_Orders_Order_Seller`
- INDEX (BuyerId, CreatedAt) `IX_BuyerOrders`
- INDEX (SellerId, Status, CreatedAt) `IX_SellerOrders`
- FOREIGN KEY (BuyerId) -> Users (UserId)
- FOREIGN KEY (SellerId) -> Users (UserId)
- CHECK `([BuyerId]<>[SellerId])`
- CHECK `([CommissionRate]=(0.03))`
- CHECK `([ConfirmBy]>[CreatedAt])`
- CHECK `([PaymentProvider] IS NOT NULL OR ([Status]='Cancelled' OR [Status]='AwaitingPayment' OR [Status]='Pending'))`
- CHECK `([PaymentProvider]='ZaloPay' OR [PaymentProvider]='MoMo')`
- CHECK `([ShippingFee]>=(0))`
- CHECK `([Status]='Cancelled' OR [Status]='Completed' OR [Status]='Delivering' OR [Status]='Paid' OR [Status]='AwaitingPayment' OR [Status]='Pending')`
- CHECK `([Status]='Pending' AND [ConfirmedAt] IS NULL AND [PaidAt] IS NULL AND [CompletedAt] IS NULL AND [CancelledAt] IS NULL OR [Status]='AwaitingPayment' AND [ConfirmedAt] IS NOT NULL AND [PaidAt] IS NULL AND [CompletedAt] IS NULL AND [CancelledAt] IS NULL OR [Status]='Paid' AND [ConfirmedAt] IS NOT NULL AND [PaidAt] IS NOT NULL AND [ShippedAt] IS NULL AND [CompletedAt] IS NULL AND [CancelledAt] IS NULL OR [Status]='Delivering' AND [ConfirmedAt] IS NOT NULL AND [PaidAt] IS NOT NULL AND [ShippedAt] IS NOT NULL AND [CompletedAt] IS NULL AND [CancelledAt] IS NULL OR [Status]='Completed' AND [ConfirmedAt] IS NOT NULL AND [PaidAt] IS NOT NULL AND [ShippedAt] IS NOT NULL AND [CompletedAt] IS NOT NULL AND [CancelledAt] IS NULL OR [Status]='Cancelled' AND [PaidAt] IS NULL AND [CompletedAt] IS NULL AND [CancelledAt] IS NOT NULL)`
- CHECK `([Subtotal]>(0))`

## dbo.OrderStatusHistory

| Column | Type | Null | Default / computed |
|---|---|---|---|
| HistoryId | bigint identity | no |  |
| OrderId | bigint | no |  |
| Status | varchar(20) | no |  |
| ChangedBy | int | yes |  |
| Note | nvarchar(500) | yes |  |
| ChangedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (HistoryId)
- FOREIGN KEY (ChangedBy) -> Users (UserId)
- FOREIGN KEY (OrderId) -> Orders (OrderId)

## dbo.PasswordResetTokens

| Column | Type | Null | Default / computed |
|---|---|---|---|
| TokenId | bigint identity | no |  |
| UserId | int | no |  |
| TokenHash | binary(32) | no |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| ExpiresAt | datetime2(0) | no |  |
| ConsumedAt | datetime2(0) | yes |  |

Keys and indexes:
- PRIMARY KEY (TokenId)
- UNIQUE (TokenHash)
- INDEX (UserId, ExpiresAt) `IX_ResetTokens_User`
- FOREIGN KEY (UserId) -> Users (UserId)
- CHECK `([ExpiresAt]>[CreatedAt])`

## dbo.Payments

| Column | Type | Null | Default / computed |
|---|---|---|---|
| PaymentId | bigint identity | no |  |
| OrderId | bigint | no |  |
| Provider | varchar(10) | no |  |
| RequestKey | varchar(100) | no |  |
| ProviderReference | varchar(150) | yes |  |
| Amount | decimal(18,0) | no |  |
| Status | varchar(10) | no | default `('Pending')` |
| IsSandbox | bit | no | default `((1))` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| FinishedAt | datetime2(0) | yes |  |

Keys and indexes:
- PRIMARY KEY (PaymentId)
- UNIQUE (RequestKey)
- INDEX (OrderId, Status) `IX_PaymentOrder`
- UNIQUE INDEX (Provider, ProviderReference) WHERE ([ProviderReference] IS NOT NULL) `UX_PaymentReference`
- UNIQUE INDEX (OrderId) WHERE ([Status]='Pending') `UX_PendingPayment`
- UNIQUE INDEX (OrderId) WHERE ([Status]='Succeeded') `UX_SuccessfulPayment`
- FOREIGN KEY (OrderId) -> Orders (OrderId)
- CHECK `([Amount]>(0))`
- CHECK `([Provider]='ZaloPay' OR [Provider]='MoMo')`
- CHECK `([Status]='Expired' OR [Status]='Succeeded' OR [Status]='Failed' OR [Status]='Pending')`
- CHECK `([Status]='Pending' AND [FinishedAt] IS NULL OR [Status]<>'Pending' AND [FinishedAt] IS NOT NULL)`

## dbo.ProductImages

| Column | Type | Null | Default / computed |
|---|---|---|---|
| ImageId | int identity | no |  |
| ProductId | int | no |  |
| ImageUrl | nvarchar(1000) | no |  |
| SortOrder | int | no | default `((0))` |

Keys and indexes:
- PRIMARY KEY (ImageId)
- UNIQUE (ProductId, SortOrder)
- FOREIGN KEY (ProductId) -> Products (ProductId)
- CHECK `([SortOrder]>=(0))`

## dbo.ProductPromotions

| Column | Type | Null | Default / computed |
|---|---|---|---|
| PromotionId | bigint identity | no |  |
| ProductId | int | no |  |
| PackageId | int | no |  |
| Amount | decimal(18,0) | no |  |
| Provider | varchar(10) | no |  |
| RequestKey | varchar(100) | no |  |
| ProviderReference | varchar(150) | yes |  |
| Status | varchar(10) | no | default `('Pending')` |
| StartsAt | datetime2(0) | yes |  |
| EndsAt | datetime2(0) | yes |  |
| IsSandbox | bit | no | default `((1))` |

Keys and indexes:
- PRIMARY KEY (PromotionId)
- UNIQUE (RequestKey)
- UNIQUE INDEX (Provider, ProviderReference) WHERE ([ProviderReference] IS NOT NULL) `UX_PromotionReference`
- FOREIGN KEY (PackageId) -> PromotionPackages (PackageId)
- FOREIGN KEY (ProductId) -> Products (ProductId)
- CHECK `([Amount]>(0))`
- CHECK `([Provider]='ZaloPay' OR [Provider]='MoMo')`
- CHECK `([Status]='Paid' AND [StartsAt] IS NOT NULL AND [EndsAt]>[StartsAt] OR ([Status]='Failed' OR [Status]='Pending') AND [StartsAt] IS NULL AND [EndsAt] IS NULL)`
- CHECK `([Status]='Paid' OR [Status]='Failed' OR [Status]='Pending')`

## dbo.Products

| Column | Type | Null | Default / computed |
|---|---|---|---|
| ProductId | int identity | no |  |
| SellerId | int | no |  |
| CategoryId | int | no |  |
| CampusId | int | no |  |
| Title | nvarchar(200) | no |  |
| Description | nvarchar(max) | no |  |
| Condition | varchar(10) | no |  |
| Price | decimal(18,0) | no |  |
| OriginalPrice | decimal(18,0) | yes |  |
| Status | varchar(12) | no | default `('Draft')` |
| ModerationStatus | varchar(10) | no | default `('Approved')` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| UpdatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| Version | timestamp | no |  |

Keys and indexes:
- PRIMARY KEY (ProductId)
- UNIQUE (ProductId, SellerId) `UQ_Products_Product_Seller`
- INDEX (Status, ModerationStatus, CampusId, CategoryId, Condition, Price) `IX_ProductSearch`
- INDEX (SellerId, Status) `IX_SellerProducts`
- FOREIGN KEY (CampusId) -> Campuses (CampusId)
- FOREIGN KEY (CategoryId) -> Categories (CategoryId)
- FOREIGN KEY (SellerId) -> Users (UserId)
- CHECK `([Condition]='Used' OR [Condition]='Like New' OR [Condition]='New')`
- CHECK `([ModerationStatus]='Rejected' OR [ModerationStatus]='Approved' OR [ModerationStatus]='Pending')`
- CHECK `([OriginalPrice] IS NULL OR [OriginalPrice]>=[Price])`
- CHECK `([Price]>(0))`
- CHECK `([Status]='Removed' OR [Status]='Sold' OR [Status]='Reserved' OR [Status]='Available' OR [Status]='Draft')`

## dbo.PromotionPackages

| Column | Type | Null | Default / computed |
|---|---|---|---|
| PackageId | int identity | no |  |
| Name | nvarchar(100) | no |  |
| DurationHours | int | no |  |
| Price | decimal(18,0) | no |  |

Keys and indexes:
- PRIMARY KEY (PackageId)
- CHECK `([DurationHours]>(0))`
- CHECK `([Price]>(0))`

## dbo.Reports

| Column | Type | Null | Default / computed |
|---|---|---|---|
| ReportId | bigint identity | no |  |
| ReporterId | int | no |  |
| ProductId | int | yes |  |
| ReportedUserId | int | yes |  |
| Reason | nvarchar(2000) | no |  |
| Status | varchar(10) | no | default `('Open')` |
| ResolvedBy | int | yes |  |
| Resolution | nvarchar(2000) | yes |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| ResolvedAt | datetime2(0) | yes |  |

Keys and indexes:
- PRIMARY KEY (ReportId)
- FOREIGN KEY (ProductId) -> Products (ProductId)
- FOREIGN KEY (ReportedUserId) -> Users (UserId)
- FOREIGN KEY (ReporterId) -> Users (UserId)
- FOREIGN KEY (ResolvedBy) -> Users (UserId)
- CHECK `(([Status]='Reviewing' OR [Status]='Open') AND [ResolvedBy] IS NULL AND [ResolvedAt] IS NULL OR ([Status]='Dismissed' OR [Status]='Resolved') AND [ResolvedBy] IS NOT NULL AND [ResolvedAt] IS NOT NULL)`
- CHECK `([ProductId] IS NOT NULL AND [ReportedUserId] IS NULL OR [ProductId] IS NULL AND [ReportedUserId] IS NOT NULL)`
- CHECK `([Status]='Dismissed' OR [Status]='Resolved' OR [Status]='Reviewing' OR [Status]='Open')`
- CHECK `(len(ltrim(rtrim([Reason])))>(0))`

## dbo.Reviews

| Column | Type | Null | Default / computed |
|---|---|---|---|
| ReviewId | bigint identity | no |  |
| OrderId | bigint | no |  |
| ReviewerId | int | no |  |
| RevieweeId | int | no |  |
| Rating | tinyint | no |  |
| Comment | nvarchar(2000) | yes |  |
| IsHidden | bit | no | default `((0))` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (ReviewId)
- UNIQUE (OrderId, ReviewerId)
- INDEX (RevieweeId, IsHidden) `IX_Reviews`
- FOREIGN KEY (OrderId) -> Orders (OrderId)
- FOREIGN KEY (RevieweeId) -> Users (UserId)
- FOREIGN KEY (ReviewerId) -> Users (UserId)
- CHECK `([Rating]>=(1) AND [Rating]<=(5))`
- CHECK `([ReviewerId]<>[RevieweeId])`

## dbo.SchemaMigrations

| Column | Type | Null | Default / computed |
|---|---|---|---|
| Version | varchar(20) | no |  |
| Description | nvarchar(200) | no |  |
| AppliedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| AppliedBy | nvarchar(128) | no | default `(suser_sname())` |

Keys and indexes:
- PRIMARY KEY (Version) `PK_SchemaMigrations`

## dbo.SellerSettlements

| Column | Type | Null | Default / computed |
|---|---|---|---|
| OrderId | bigint | no |  |
| SellerId | int | no |  |
| Amount | decimal(18,0) | no |  |
| Status | varchar(10) | no | default `('Pending')` |
| IsSandbox | bit | no | default `((1))` |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| ReleasedAt | datetime2(0) | yes |  |
| MerchandiseSubtotal | decimal(18,0) | no |  |
| CommissionAmount | decimal(18,0) | no |  |
| ShippingFee | decimal(18,0) | no |  |
| ReleasedBy | int | yes |  |
| PayoutReference | nvarchar(100) | yes |  |
| PayoutNote | nvarchar(500) | yes |  |

Keys and indexes:
- PRIMARY KEY (OrderId)
- FOREIGN KEY (OrderId) -> Orders (OrderId)
- FOREIGN KEY (ReleasedBy) -> Users (UserId)
- FOREIGN KEY (SellerId) -> Users (UserId)
- CHECK `([Amount]=(([MerchandiseSubtotal]-[CommissionAmount])+[ShippingFee]))`
- CHECK `([Amount]>=(0))`
- CHECK `([CommissionAmount]=round([MerchandiseSubtotal]*(0.03),(0)))`
- CHECK `([ShippingFee]>=(0))`
- CHECK `([Status]='Pending' AND [ReleasedAt] IS NULL OR [Status]='Released' AND [ReleasedAt] IS NOT NULL)`
- CHECK `([Status]='Released' OR [Status]='Pending')`

## dbo.Universities

| Column | Type | Null | Default / computed |
|---|---|---|---|
| UniversityId | int identity | no |  |
| Name | nvarchar(200) | no |  |
| Code | varchar(30) | no |  |

Keys and indexes:
- PRIMARY KEY (UniversityId)
- UNIQUE (Code)

## dbo.UniversityEmailDomains

| Column | Type | Null | Default / computed |
|---|---|---|---|
| Domain | varchar(150) | no |  |
| UniversityId | int | no |  |

Keys and indexes:
- PRIMARY KEY (Domain)
- FOREIGN KEY (UniversityId) -> Universities (UniversityId)

## dbo.UserAddresses

| Column | Type | Null | Default / computed |
|---|---|---|---|
| AddressId | int identity | no |  |
| UserId | int | no |  |
| RecipientName | nvarchar(150) | no |  |
| Phone | varchar(20) | no |  |
| AddressLine | nvarchar(500) | no |  |
| IsDefault | bit | no | default `((0))` |

Keys and indexes:
- PRIMARY KEY (AddressId)
- UNIQUE INDEX (UserId) WHERE ([IsDefault]=(1)) `UX_DefaultAddress`
- FOREIGN KEY (UserId) -> Users (UserId)

## dbo.Users

| Column | Type | Null | Default / computed |
|---|---|---|---|
| UserId | int identity | no |  |
| Email | varchar(254) | no |  |
| PasswordHash | varchar(255) | no |  |
| FullName | nvarchar(150) | no |  |
| Phone | varchar(20) | yes |  |
| ZaloUrl | nvarchar(500) | yes |  |
| ShowContact | bit | no | default `((0))` |
| AvatarUrl | nvarchar(1000) | yes |  |
| CampusId | int | no |  |
| Role | varchar(10) | no | default `('Student')` |
| Status | varchar(12) | no | default `('Active')` |
| EmailVerifiedAt | datetime2(0) | yes |  |
| CreatedAt | datetime2(0) | no | default `(sysutcdatetime())` |
| UpdatedAt | datetime2(0) | no | default `(sysutcdatetime())` |

Keys and indexes:
- PRIMARY KEY (UserId)
- UNIQUE (Email)
- FOREIGN KEY (CampusId) -> Campuses (CampusId)
- CHECK `([Email] like '%_@_%._%')`
- CHECK `([Role]='Admin' OR [Role]='Student')`
- CHECK `([Status]='Closed' OR [Status]='Suspended' OR [Status]='Active')`
- CHECK `(len([PasswordHash])>=(20))`

## Views

- `dbo.vw_ActiveOrderItems` (schema-bound, indexed)
- `dbo.vw_AdminDashboard`
- `dbo.vw_ProductCatalog`
- `dbo.vw_PublicProfiles`
- `dbo.vw_UserRatings`

## Stored procedures

- `dbo.usp_CancelOrder(@OrderId bigint, @ActorId int, @Reason nvarchar)`
- `dbo.usp_Checkout(@BuyerId int, @ProductIds ProductIdList READONLY, @RecipientName nvarchar, @RecipientPhone varchar, @DeliveryAddress nvarchar, @PaymentProvider varchar, @ShippingFee decimal)`
- `dbo.usp_CompleteOrder(@OrderId bigint, @BuyerId int)`
- `dbo.usp_ConfirmDisputeRefund(@DisputeId bigint, @AdminId int, @RefundReference nvarchar)`
- `dbo.usp_ConfirmOrder(@OrderId bigint, @SellerId int)`
- `dbo.usp_ExpirePendingOrders()`
- `dbo.usp_MarkSettlementReleased(@OrderId bigint, @AdminId int, @PayoutReference nvarchar, @Note nvarchar)`
- `dbo.usp_OpenOrderDispute(@OrderId bigint, @UserId int, @Reason nvarchar)`
- `dbo.usp_RecordPaymentResult(@RequestKey varchar, @ProviderReference varchar, @Amount decimal, @Success bit, @Provider varchar)`
- `dbo.usp_ResolveOrderDispute(@DisputeId bigint, @AdminId int, @Decision varchar, @Resolution nvarchar)`
- `dbo.usp_ShipOrder(@OrderId bigint, @SellerId int, @Carrier nvarchar, @TrackingNumber varchar)`
- `dbo.usp_StartPayment(@OrderId bigint, @BuyerId int, @RequestKey varchar, @IsSandbox bit, @Provider varchar)`
- `dbo.usp_VerifyEmail(@TokenHash binary)`

## Triggers

- `dbo.trg_Cart_Validate` on CartItems
- `dbo.trg_Reviews_Validate` on Reviews
- `dbo.trg_SellerSettlements_Guard` on SellerSettlements

## Table types

- `dbo.ProductIdList` (ProductId int)
