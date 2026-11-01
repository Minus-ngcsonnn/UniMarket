import { ORDER_STATUSES } from '../../constants/order'

/** Order status pill with dot (same style as listing status pills). */
export default function OrderStatusBadge({ status }) {
  const config = ORDER_STATUSES[status]
  if (!config) return null
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${config.pill}`}>
      <span className={`size-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  )
}
