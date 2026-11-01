import Button from './ui/Button'

/** Tailwind classes for each connection state (colors come from the design tokens in index.css). */
const STATUS_STYLES = {
  pending: 'border-line bg-surface text-ink-muted',
  up: 'border-success/30 bg-success-soft text-success',
  down: 'border-danger/30 bg-danger-soft text-danger',
}

/**
 * Shows whether the frontend can reach the backend's /api/health endpoint.
 * Presentational: pass the result of useBackendHealth() so the check runs only once.
 */
export default function BackendStatus({ loading, data, error, refresh }) {
  let statusClass = STATUS_STYLES.pending
  let message = 'Checking backend connection…'

  if (!loading && data?.status === 'UP') {
    statusClass = STATUS_STYLES.up
    message = `Backend connected: ${data.application} is ${data.status}`
  } else if (!loading) {
    statusClass = STATUS_STYLES.down
    message = error ?? 'Backend returned an unexpected response'
  }

  return (
    <section className="flex flex-col items-center gap-3" aria-live="polite">
      <p className={`rounded-control border px-4 py-3 text-sm ${statusClass}`}>{message}</p>
      <Button variant="secondary" onClick={refresh} disabled={loading}>
        Check again
      </Button>
    </section>
  )
}
