import { useId } from 'react'
import { XIcon } from '../icons'
import Modal from '../ui/Modal'
import useTranslation from '../../i18n/useTranslation'

/** Read-only fact list for detail dialogs. @param {[string, React.ReactNode][]} items */
export function DetailList({ items }) {
  const { t } = useTranslation()
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
      {items
        .filter(([, value]) => value != null && value !== '')
        .map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-xs text-ink-muted">{t(term)}</dt>
            <dd className="mt-0.5 font-medium break-words text-ink">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

/**
 * Admin detail dialog: header (title, subtitle, status), content and action buttons.
 * @param {React.ReactNode} [actions] buttons in the footer
 */
export default function DetailDialog({ title, subtitle, status, actions, onClose, children }) {
  const { t } = useTranslation()
  const titleId = useId()
  return (
    <Modal onClose={onClose} labelledBy={titleId} className="sm:max-w-xl">
      <div className="flex flex-col">
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {t(title)}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{t(subtitle)}</p>}
            {status && <div className="mt-2 flex flex-wrap gap-2">{status}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">{children}</div>
        {actions && <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">{actions}</div>}
      </div>
    </Modal>
  )
}
