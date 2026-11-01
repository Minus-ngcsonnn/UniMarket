import Spinner from './Spinner'
import useTranslation from '../../i18n/useTranslation'

/** Centered loading indicator for a page or section that is fetching data. */
export default function LoadingState({ message = 'Loading…', className = '' }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 py-12 text-ink-muted ${className}`}>
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm">{t(message)}</p>
    </div>
  )
}
