/* Read-only, row-level snapshot of historical data (one hash per row). Run before and after V003; outputs must be equal.
     sqlcmd -S <server> -E -C -I -W -h -1 -f 65001 -d UniMarketJava -i V003_history_snapshot.sql -o <file>
   Only columns that exist before AND after V003 are hashed. */
SET NOCOUNT ON;
SELECT 'Users|' + CAST(UserId AS varchar(10)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT_WS('|', Email, PasswordHash, FullName,
       Phone, ZaloUrl, ShowContact, AvatarUrl, CampusId, Role, Status, CONVERT(varchar(30), EmailVerifiedAt, 126),
       CONVERT(varchar(30), CreatedAt, 126), CONVERT(varchar(30), UpdatedAt, 126))), 2) FROM dbo.Users
UNION ALL
SELECT 'Products|' + CAST(ProductId AS varchar(10)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT_WS('|', SellerId, CategoryId, CampusId,
       Title, Description, Condition, Price, OriginalPrice, Status, ModerationStatus, CONVERT(varchar(30), CreatedAt, 126),
       CONVERT(varchar(30), UpdatedAt, 126))), 2) FROM dbo.Products
UNION ALL
SELECT 'Orders|' + CAST(OrderId AS varchar(20)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT_WS('|', BuyerId, SellerId, Status, Subtotal,
       ShippingFee, TotalAmount, CommissionRate, CommissionAmount, SellerProceeds, SellerPayoutTotal, PaymentProvider, RecipientName,
       RecipientPhone, DeliveryAddress, CONVERT(varchar(30), CreatedAt, 126), CONVERT(varchar(30), ConfirmBy, 126),
       CONVERT(varchar(30), ConfirmedAt, 126), CONVERT(varchar(30), PaymentDueAt, 126), CONVERT(varchar(30), PaidAt, 126),
       CONVERT(varchar(30), ShippedAt, 126), CONVERT(varchar(30), CompletedAt, 126), CONVERT(varchar(30), CancelledAt, 126),
       CancellationReason)), 2) FROM dbo.Orders
UNION ALL
SELECT 'OrderItems|' + CAST(OrderId AS varchar(20)) + '-' + CAST(ProductId AS varchar(10)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256',
       CONCAT_WS('|', UnitPrice, Quantity, ProductTitle)), 2) FROM dbo.OrderItems
UNION ALL
SELECT 'Payments|' + CAST(PaymentId AS varchar(20)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT_WS('|', OrderId, Provider, Status, Amount,
       IsSandbox, RequestKey, ProviderReference, CONVERT(varchar(30), CreatedAt, 126), CONVERT(varchar(30), FinishedAt, 126))), 2) FROM dbo.Payments
UNION ALL
SELECT 'SellerSettlements|' + CAST(OrderId AS varchar(20)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT_WS('|', SellerId, Amount,
       MerchandiseSubtotal, CommissionAmount, ShippingFee, Status, IsSandbox, PayoutReference, ReleasedBy,
       CONVERT(varchar(30), CreatedAt, 126), CONVERT(varchar(30), ReleasedAt, 126))), 2) FROM dbo.SellerSettlements
UNION ALL
SELECT 'ProductPromotions|' + CAST(PromotionId AS varchar(20)) + '|' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT_WS('|', ProductId, Provider,
       Status, Amount, CONVERT(varchar(30), StartsAt, 126), CONVERT(varchar(30), EndsAt, 126))), 2) FROM dbo.ProductPromotions
UNION ALL
SELECT 'OrderStatusHistory|count|' + CAST(COUNT(*) AS varchar(20)) FROM dbo.OrderStatusHistory
UNION ALL
SELECT 'Reviews|count|' + CAST(COUNT(*) AS varchar(20)) FROM dbo.Reviews;
