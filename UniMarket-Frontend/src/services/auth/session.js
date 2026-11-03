import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import { setAccessToken, setUnauthorizedHandler } from '../apiClient'
import { authApi } from './authApi'
import { tokenStore } from './tokenStore'

/**
 * Signed-in state for the real backend (VITE_AUTH_MODE=backend). A tiny external store for useSyncExternalStore.
 *
 * status:
 * - 'restoring'     a stored token exists and GET /api/auth/me is being checked (page load / refresh)
 * - 'authenticated' `user` is the latest GET /api/auth/me answer — the only source of the role and profile
 * - 'anonymous'     no valid session
 *
 * The backend re-checks the token and the account (active, verified) on every request; the UI never trusts a
 * locally stored role. There is no logout endpoint (stateless JWT): signing out forgets the token in this browser.
 * The token itself stays valid on the server until it expires (1 h by default).
 */
const listeners = new Set()
let state = { status: 'anonymous', user: null, reason: null }

function setState(next) {
  state = next
  listeners.forEach((listener) => listener())
}

function forget(reason) {
  tokenStore.clear()
  setAccessToken(null)
  setState({ status: 'anonymous', user: null, reason })
}

/** Restores a stored session on page load; a 401 / expired token ends it quietly. */
async function restore() {
  const stored = tokenStore.get()
  if (!stored) return
  setAccessToken(stored.token)
  setState({ status: 'restoring', user: null, reason: null })
  try {
    const user = await authApi.me()
    setState({ status: 'authenticated', user, reason: null })
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      forget('expired')
    } else {
      // Backend unreachable: keep the token (it may still be valid) but show the guest UI until it answers.
      setState({ status: 'anonymous', user: null, reason: 'unreachable' })
    }
  }
}

export const session = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,

  /**
   * Signs in: POST /api/auth/login, then GET /api/auth/me with the new token. Rejects with the ApiError of
   * the failing call; nothing is stored unless both succeed.
   * @returns {Promise<object>} the signed-in user (from /me)
   */
  async signIn(email, password, remember) {
    const login = await authApi.login(email, password)
    const user = await authApi.me(login.accessToken)
    tokenStore.set(login.accessToken, login.expiresAt, remember)
    setAccessToken(login.accessToken)
    setState({ status: 'authenticated', user, reason: null })
    return user
  },

  /** Re-reads the profile from the server (e.g. when the profile page opens). */
  async refresh() {
    if (state.status !== 'authenticated') return state.user
    const user = await authApi.me()
    setState({ status: 'authenticated', user, reason: null })
    return user
  },

  /** Signs out in this browser: forgets the token and the user. */
  signOut() {
    forget('signedOut')
  },
}

if (USES_BACKEND_AUTH) {
  // An authenticated request answered 401: the token expired, was revoked, or the account can no longer sign in.
  setUnauthorizedHandler(() => {
    if (state.status !== 'anonymous') forget('expired')
  })
  // Another tab signed in or out: follow it.
  window.addEventListener('storage', (event) => {
    if (event.key !== tokenStore.STORAGE_KEY) return
    if (!tokenStore.get()) {
      if (state.status !== 'anonymous') forget('signedOut')
    } else if (state.status === 'anonymous') {
      restore()
    }
  })
  restore()
}
