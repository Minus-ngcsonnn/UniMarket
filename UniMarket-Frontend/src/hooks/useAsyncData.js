import { useEffect, useEffectEvent, useState } from 'react'

/**
 * Loads data asynchronously and tracks loading/error state.
 *
 * @param {() => Promise<any>} load function that fetches the data
 * @param {string} key identifies the request; when it changes, `load` runs again
 * @returns {{ data, previousData, error, isLoading, isRefreshing, reload }}
 *   - previousData keeps the last result while a different request loads (avoids flicker).
 *   - reload() re-runs the same request. While it runs, `data` keeps the current result and
 *     isRefreshing is true (used for background refresh such as polling), so nothing flashes.
 */
export default function useAsyncData(load, key) {
  const [result, setResult] = useState({ key: null, data: undefined, error: null })
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${key}#${attempt}`
  const runLoad = useEffectEvent(load)

  useEffect(() => {
    let isActive = true // ignore responses for outdated requests
    runLoad()
      .then((data) => isActive && setResult({ key: requestKey, data, error: null }))
      .catch((error) => isActive && setResult({ key: requestKey, data: undefined, error }))
    return () => {
      isActive = false
    }
  }, [requestKey])

  const isCurrent = result.key === requestKey
  // Same request, earlier attempt (e.g. a refresh is running): keep showing what we have.
  const isSameQuery = result.key !== null && result.key.slice(0, result.key.lastIndexOf('#')) === key
  const hasStaleData = !isCurrent && isSameQuery && result.data !== undefined

  return {
    data: isCurrent || hasStaleData ? result.data : undefined,
    previousData: result.data,
    error: isCurrent ? result.error : null,
    isLoading: !isCurrent && !hasStaleData,
    isRefreshing: hasStaleData,
    reload: () => setAttempt((count) => count + 1),
  }
}
