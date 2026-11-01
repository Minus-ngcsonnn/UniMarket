import { useEffect, useEffectEvent } from 'react'

/**
 * Calls `callback` every `intervalMs` while the browser tab is visible (Q4: polling).
 * Pauses in background tabs and runs once immediately when the tab becomes visible again.
 */
export default function usePolling(callback, intervalMs, enabled = true) {
  const tick = useEffectEvent(callback)

  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(() => {
      if (!document.hidden) tick()
    }, intervalMs)
    function handleVisibility() {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs, enabled])
}
