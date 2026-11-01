import Spinner from './Spinner'

/** Centered loading indicator for a page or section that is fetching data. */
export default function LoadingState({ message = 'Loading…', className = '' }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 py-12 text-ink-muted ${className}`}>
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
