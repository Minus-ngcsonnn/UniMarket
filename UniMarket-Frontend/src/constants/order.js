/**
 * Order flow from the Business Plan:
 *   buyer places an order → seller confirms within 24 h → buyer pays online → seller delivers
 *   → buyer confirms receipt → completed (→ reviews, later phase). Either side can cancel before payment.
 *
 * Q3 (approved): ONE ORDER PER SELLER. Checkout groups the selected listings by seller; each order holds
 * that seller's items (each second-hand listing is a single unit). The seller confirms or declines the
 * whole order, the buyer pays each order once, and the seller delivers it in one go.
 */
export const ORDER_STATUSES = {
  PENDING: { label: 'Waiting for seller', tone: 'warning' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', tone: 'primary' },
  PAID: { label: 'Paid', tone: 'success' },
  DELIVERING: { label: 'Delivering', tone: 'primary' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
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

/** Q4 (approved): order pages and the header refresh order data every 30 s while the tab is visible. */
export const ORDER_POLL_INTERVAL_MS = 30_000

/** Statuses where it is this person's turn to act (header badge, "Needs your action"). */
export const NEEDS_ACTION = {
  buyer: ['AWAITING_PAYMENT', 'DELIVERING'],
  seller: ['PENDING', 'PAID'],
}

/** Status filter for order lists. */
export const ORDER_FILTERS = [
  { key: 'ALL', label: 'All', statuses: null },
  { key: 'ACTIVE', label: 'Active', statuses: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'DELIVERING'] },
  { key: 'COMPLETED', label: 'Completed', statuses: ['COMPLETED'] },
  { key: 'CANCELLED', label: 'Cancelled', statuses: ['CANCELLED'] },
]

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
