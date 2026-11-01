/**
 * Order flow from the Business Plan:
 *   buyer places an order → seller confirms within 24 h → buyer pays online → seller delivers
 *   → buyer confirms receipt → completed (→ reviews, later phase). Either side can cancel before payment.
 * One order per listing (each second-hand item is a single unit).
 */
export const ORDER_STATUSES = {
  PENDING: { label: 'Waiting for seller', pill: 'bg-warning-soft text-ink', dot: 'bg-warning' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', pill: 'bg-primary-soft text-primary', dot: 'bg-primary' },
  PAID: { label: 'Paid', pill: 'bg-success-soft text-success', dot: 'bg-success' },
  DELIVERING: { label: 'Delivering', pill: 'bg-primary-soft text-primary', dot: 'bg-primary' },
  COMPLETED: { label: 'Completed', pill: 'bg-success-soft text-success', dot: 'bg-success' },
  CANCELLED: { label: 'Cancelled', pill: 'bg-subtle text-ink-muted', dot: 'bg-ink-muted' },
}

/** Main path shown as a progress tracker (cancelled orders leave the path). */
export const ORDER_STEPS = [
  { status: 'PENDING', label: 'Ordered' },
  { status: 'AWAITING_PAYMENT', label: 'Confirmed' },
  { status: 'PAID', label: 'Paid' },
  { status: 'DELIVERING', label: 'Delivering' },
  { status: 'COMPLETED', label: 'Received' },
]

/** Hours the seller has to confirm an order (Business Plan). */
export const SELLER_CONFIRM_HOURS = 24

/** Online payment methods. Simulated in the demo: no real payment provider is connected. */
export const PAYMENT_METHODS = [
  { value: 'MOMO', label: 'MoMo e-wallet' },
  { value: 'ZALOPAY', label: 'ZaloPay' },
  { value: 'CARD', label: 'Bank card (ATM / Visa)' },
]

/** Human-readable order number, e.g. UO-3001. */
export function orderCode(id) {
  return `UO-${id}`
}
