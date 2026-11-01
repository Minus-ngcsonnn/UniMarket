import { useEffect, useEffectEvent, useState } from 'react'

/**
 * Loads data asynchronously and tracks loading/error state.
 *
 * @param {() => Promise<any>} load function that fetches the data
 * @param {string} key identifies the request; when it changes, `load` runs again
 * @returns {{ data, previousData, error, isLoading, reload }}
 *   previousData keeps the last successful result while a new request is loading (avoids flicker).
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
  return {
    data: isCurrent ? result.data : undefined,
    previousData: result.data,
    error: isCurrent ? result.error : null,
    isLoading: !isCurrent,
    reload: () => setAttempt((count) => count + 1),
  }
}
