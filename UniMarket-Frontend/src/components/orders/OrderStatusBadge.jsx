import { ORDER_STATUSES } from '../../constants/order'
import useTranslation from '../../i18n/useTranslation'
import StatusPill from '../ui/StatusPill'

/** Order status pill with dot (same style as listing status pills). */
export default function OrderStatusBadge({ status }) {
  const { t } = useTranslation()
  const config = ORDER_STATUSES[status]
  if (!config) return null
  return <StatusPill tone={config.tone}>{t(config.label)}</StatusPill>
}
