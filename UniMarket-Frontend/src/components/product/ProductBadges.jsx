import { LISTING_MODERATION } from '../../constants/moderation'
import { CONDITIONS, STATUSES } from '../../constants/product'
import useTranslation from '../../i18n/useTranslation'
import StatusPill from '../ui/StatusPill'

/** Item condition tag (Figma card: "Like new" green, "New" blue, "Used" grey). */
export function ConditionBadge({ condition, className = '' }) {
  const { t } = useTranslation()
  const config = CONDITIONS[condition]
  if (!config) return null
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${config.badge} ${className}`}>{t(`conditions.${condition}`)}</span>
}

/**
 * Admin review state of a listing (pre-moderation). Sellers see "Pending review" / "Blocked";
 * approved listings show nothing unless `showApproved` is set (admin tables).
 * @param {'seller'|'admin'} [audience]
 */
export function ModerationBadge({ moderation, audience = 'seller', showApproved = false, className = '' }) {
  const config = LISTING_MODERATION[moderation]
  if (!config || (moderation === 'APPROVED' && !showApproved)) return null
  return (
    <StatusPill tone={config.tone} className={className}>
      {audience === 'seller' ? config.sellerLabel : config.label}
    </StatusPill>
  )
}

/** Availability pill with status dot (Figma admin table style: "● Active", "● Pending"). */
export function ProductStatusBadge({ status, className = '' }) {
  const { t } = useTranslation()
  const config = STATUSES[status]
  if (!config) return null
  return (
    <StatusPill tone={config.tone} className={className}>
      {t(`statuses.${status}`)}
    </StatusPill>
  )
}
