import axios from 'axios'
import { API_BASE_URL, API_TIMEOUT_MS } from '../config/apiConfig'
import { toApiError } from './apiError'

/**
 * Shared Axios instance for all UniMarket API calls.
 *
 * - Base URL from VITE_API_BASE_URL (default "/api", proxied by the Vite dev server to VITE_BACKEND_URL).
 * - JSON in and out, 15 s timeout.
 * - Adds "Authorization: Bearer <token>" when a session token is set (see services/auth/session.js).
 * - Every failure is rejected as an ApiError (services/apiError.js): HTTP errors keep the backend's
 *   code / message / fieldErrors; network failures and timeouts get a friendly message.
 * - A 401 on a request that carried a token means the session is no longer valid: the registered
 *   handler signs the user out (expired / revoked token, suspended account).
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

let accessToken = null
let onUnauthorized = () => {}

/** Used by the session only. */
export function setAccessToken(token) {
  accessToken = token
}

/** Used by the session only: called when an authenticated request answers 401. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

apiClient.interceptors.request.use((config) => {
  if (accessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error)
    const sentToken = Boolean(error?.config?.headers?.Authorization)
    if (apiError.status === 401 && sentToken) {
      onUnauthorized(apiError)
    }
    return Promise.reject(apiError)
  },
)

export default apiClient
