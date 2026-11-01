import useBackendHealth from '../hooks/useBackendHealth'

/** Tailwind classes for each connection state (colors come from the design tokens in index.css). */
const STATUS_STYLES = {
  pending: 'border-line bg-surface text-ink-muted',
  up: 'border-success/30 bg-success-soft text-success',
  down: 'border-danger/30 bg-danger-soft text-danger',
}

/** Shows whether the frontend can reach the backend's /api/health endpoint. */
export default function BackendStatus() {
  const { loading, data, error, refresh } = useBackendHealth()

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
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
      >
        Check again
      </button>
    </section>
  )
}
