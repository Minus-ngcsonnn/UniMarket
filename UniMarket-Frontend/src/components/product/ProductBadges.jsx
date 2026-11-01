import { CONDITIONS, STATUSES } from '../../constants/product'

/** Item condition tag (Figma card: "Like new" green, "New" blue, "Used" grey). */
export function ConditionBadge({ condition, className = '' }) {
  const config = CONDITIONS[condition]
  if (!config) return null
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${config.badge} ${className}`}>{config.label}</span>
}

/** Availability pill with status dot (Figma admin table style: "● Active", "● Pending"). */
export function ProductStatusBadge({ status, className = '' }) {
  const config = STATUSES[status]
  if (!config) return null
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.pill} ${className}`}>
      <span className={`size-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  )
}
