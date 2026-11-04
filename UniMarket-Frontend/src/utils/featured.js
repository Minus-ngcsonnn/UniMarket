/**
 * A listing is shown as "Featured" only while its paid promotion is running now (backend `featured`, computed from
 * ProductPromotions: Paid and now within [StartsAt, EndsAt)) and it can still be bought. Starting or failing a
 * promotion payment never sets `featured`.
 */
export function isShownAsFeatured(product) {
  return Boolean(product?.featured) && (!product.status || product.status === 'AVAILABLE')
}
