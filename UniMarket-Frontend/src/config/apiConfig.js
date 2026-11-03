/**
 * API and authentication configuration (build-time, from Vite env variables).
 * Never put secrets in VITE_* variables: they are embedded in the browser bundle.
 *
 * - VITE_API_BASE_URL: base URL of the UniMarket API as seen by the browser. Default '/api', which the Vite dev
 *   server (and `vite preview`) proxies to VITE_BACKEND_URL, so the browser talks to one origin and no CORS is
 *   needed. Set an absolute URL only when the backend allows this frontend's origin (CORS_ALLOWED_ORIGINS).
 * - VITE_AUTH_MODE: 'backend' = real registration / OTP / login / profile through the API;
 *   'demo' = the previous preview (sample student shown as signed in, nothing sent).
 *   Default: 'demo' while sample data is on (plain `npm run dev`), otherwise 'backend'.
 */
import { USE_MOCK_DATA } from './dataSource'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

/** Requests slower than this fail with a timeout error (ms). */
export const API_TIMEOUT_MS = 15000

const configuredMode = import.meta.env.VITE_AUTH_MODE
export const AUTH_MODE = configuredMode === 'backend' || configuredMode === 'demo' ? configuredMode : USE_MOCK_DATA ? 'demo' : 'backend'

/** True when sign-up, sign-in and the profile use the real backend. */
export const USES_BACKEND_AUTH = AUTH_MODE === 'backend'
