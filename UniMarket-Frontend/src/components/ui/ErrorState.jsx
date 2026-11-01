import { AlertCircleIcon } from '../icons'
import Button from './Button'

/** Shown when a page or section fails to load. Pass onRetry to offer a "Try again" button. */
export default function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again in a moment.',
  onRetry,
  className = '',
}) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-3 py-12 text-center ${className}`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertCircleIcon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="max-w-sm text-sm text-ink-muted">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
