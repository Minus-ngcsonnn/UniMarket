import { InboxIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/**
 * Placeholder for a list or section with no data yet.
 * @param {React.ReactNode} [action] optional call to action, e.g. a <Button> or <Link>
 * @param {string} [titleAs] heading element for the title, e.g. 'h1' when it is the page's main message
 */
export default function EmptyState({ title, description, action, icon, titleAs: TitleTag = 'p', className = '' }) {
  const { t } = useTranslation()
  return (
    <div className={`flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center ${className}`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon ?? <InboxIcon className="size-6" />}
      </span>
      <div className="flex flex-col gap-1">
        <TitleTag className="font-semibold text-ink">{typeof title === 'string' ? t(title) : title}</TitleTag>
        {description && <p className="max-w-sm text-sm text-ink-muted">{typeof description === 'string' ? t(description) : description}</p>}
      </div>
      {action}
    </div>
  )
}
