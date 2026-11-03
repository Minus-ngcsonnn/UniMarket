import { useCallback, useEffect, useState } from 'react'
import { getHealth } from '../services/healthService'

const INITIAL_STATE = { loading: true, data: null, error: null }

// Gateway errors come from the Vite dev proxy when the backend is not running.
const PROXY_ERROR_STATUSES = [502, 503, 504]

function toErrorMessage(err) {
  const status = err.status ?? err.response?.status
  if (!status || PROXY_ERROR_STATUSES.includes(status)) {
    return 'Cannot reach the backend (check VITE_BACKEND_URL and that it is running).'
  }
  return `Backend responded with HTTP ${status}`
}

/**
 * Checks the backend health endpoint and exposes the result.
 * @returns {{ loading: boolean, data: object|null, error: string|null, refresh: () => void }}
 */
export default function useBackendHealth() {
  const [state, setState] = useState(INITIAL_STATE)
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    let isActive = true // ignore responses that arrive after unmount or a newer request

    getHealth()
      .then((data) => isActive && setState({ loading: false, data, error: null }))
      .catch((err) => isActive && setState({ loading: false, data: null, error: toErrorMessage(err) }))

    return () => {
      isActive = false
    }
  }, [requestId])

  const refresh = useCallback(() => {
    setState(INITIAL_STATE)
    setRequestId((id) => id + 1)
  }, [])

  return { ...state, refresh }
}
