/**
 * Where the access token (JWT) is kept between page loads — academic-MVP approach, NOT production-grade:
 *
 * - "Remember me" on: localStorage (survives closing the browser until the token expires, 1 h by default).
 *   Otherwise: sessionStorage (survives a refresh, cleared when the tab closes).
 * - Web storage is readable by any script on this origin, so an XSS bug could steal the token. A production setup
 *   would use a short-lived token in memory plus an HttpOnly, Secure, SameSite refresh cookie (needs backend work).
 * - Only the token and its expiry are stored. The user (name, role, …) is never stored: it is always read from
 *   GET /api/auth/me, so a modified local value cannot change what the UI trusts.
 * - The token is never logged.
 */
const KEY = 'unimarket.auth.session'

function read(storage) {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    return typeof value?.token === 'string' && typeof value?.expiresAt === 'string' ? value : null
  } catch {
    return null
  }
}

function remove(storage) {
  try {
    storage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode): nothing was stored either.
  }
}

export const tokenStore = {
  /** @returns {{ token: string, expiresAt: string } | null} a stored token that has not expired yet */
  get() {
    const stored = read(window.sessionStorage) ?? read(window.localStorage)
    if (!stored) return null
    if (Date.parse(stored.expiresAt) <= Date.now()) {
      this.clear()
      return null
    }
    return stored
  },

  /** @param {boolean} remember keep it after the browser is closed (localStorage) */
  set(token, expiresAt, remember) {
    this.clear()
    const value = JSON.stringify({ token, expiresAt })
    try {
      ;(remember ? window.localStorage : window.sessionStorage).setItem(KEY, value)
    } catch {
      // Storage blocked: the session still works until the page is reloaded (kept in memory by the session).
    }
  },

  clear() {
    remove(window.sessionStorage)
    remove(window.localStorage)
  },

  STORAGE_KEY: KEY,
}
