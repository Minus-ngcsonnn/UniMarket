import { useState } from 'react'
import useBackendHealth from '../../hooks/useBackendHealth'
import useViewer from '../../hooks/useViewer'
import BackendStatus from '../BackendStatus'

const STATES = {
  checking: { dot: 'bg-warning', label: 'Checking API' },
  up: { dot: 'bg-success', label: 'API online' },
  down: { dot: 'bg-danger', label: 'API offline' },
}

/**
 * DEVELOPMENT ONLY: small pill in the corner showing the backend health (GET /api/health).
 * Click it to see details and re-check. Rendered by MainLayout only when import.meta.env.DEV is true.
 */
export default function DevBackendBadge() {
  const health = useBackendHealth()
  const viewer = useViewer()
  const [isOpen, setIsOpen] = useState(false)

  const state = health.loading ? 'checking' : health.data?.status === 'UP' ? 'up' : 'down'
  const { dot, label } = STATES[state]

  return (
    // Hidden on phones so it never covers page content such as the product page's bottom bar.
    <aside aria-label="Developer tools" className="fixed right-3 bottom-3 z-50 flex-col items-end gap-2 max-sm:hidden sm:flex">
      {isOpen && (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-pop">
          <BackendStatus {...health} />
          {viewer.isDemo && (
            <fieldset className="flex flex-col gap-1.5 border-t border-line pt-3 text-xs text-ink">
              <legend className="mb-1 font-semibold">Header preview (sample data)</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="viewer" checked={!viewer.isGuest} onChange={() => viewer.setGuestPreview(false)} className="accent-primary" />
                Signed in as the demo student
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="viewer" checked={viewer.isGuest} onChange={() => viewer.setGuestPreview(true)} className="accent-primary" />
                Guest (Sign In / Sign Up)
              </label>
            </fieldset>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink-muted shadow-sm backdrop-blur transition-colors hover:text-ink"
      >
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
        <span className="text-ink-muted/70">· dev</span>
      </button>
    </aside>
  )
}
