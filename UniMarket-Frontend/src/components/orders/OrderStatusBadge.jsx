import { ORDER_STATUSES } from '../../constants/order'
import StatusPill from '../ui/StatusPill'

/** Order status pill with dot (same style as listing status pills). */
export default function OrderStatusBadge({ status }) {
  const config = ORDER_STATUSES[status]
  if (!config) return null
  return <StatusPill tone={config.tone}>{config.label}</StatusPill>
}
