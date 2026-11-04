import { formatDateTime } from '../../../utils/format'
import useTranslation from '../../../i18n/useTranslation'

/** "Simulated" tag for sandbox payments, refunds and payouts. */
export function SimulatedTag({ show = true }) {
  const { t } = useTranslation()
  if (!show) return null
  return <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink uppercase">{t('Simulated')}</span>
}

/** Moderation / admin history: [{ action, reason, admin?, at }] (reasons are plain text). */
export function HistoryList({ events, emptyText = 'No admin actions yet.' }) {
  const { t } = useTranslation()
  if (!events?.length) return <p className="text-sm text-ink-muted">{t(emptyText)}</p>
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {events.map((event, index) => (
        <li key={`${event.action}-${event.at}-${index}`} className="rounded-control bg-subtle px-3 py-2">
          <p className="font-medium text-ink">
            {t(event.action)} <span className="font-normal text-ink-muted">· {formatDateTime(event.at)}</span>
            {event.admin?.name && <span className="font-normal text-ink-muted"> · {event.admin.name}</span>}
          </p>
          {event.reason && <p className="mt-0.5 whitespace-pre-line text-ink-muted">{event.reason}</p>}
        </li>
      ))}
    </ol>
  )
}
