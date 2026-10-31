import useBackendHealth from '../hooks/useBackendHealth'

/** Shows whether the frontend can reach the backend's /api/health endpoint. */
export default function BackendStatus() {
  const { loading, data, error, refresh } = useBackendHealth()

  let statusClass = 'status status--pending'
  let message = 'Checking backend connection…'

  if (!loading && data?.status === 'UP') {
    statusClass = 'status status--up'
    message = `Backend connected: ${data.application} is ${data.status}`
  } else if (!loading) {
    statusClass = 'status status--down'
    message = error ?? 'Backend returned an unexpected response'
  }

  return (
    <section className="backend-status" aria-live="polite">
      <p className={statusClass}>{message}</p>
      <button type="button" onClick={refresh} disabled={loading}>
        Check again
      </button>
    </section>
  )
}
