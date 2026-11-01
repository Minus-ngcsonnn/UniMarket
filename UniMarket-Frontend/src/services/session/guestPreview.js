/**
 * DEMO ONLY: "show the header as a guest" switch for sample-data mode.
 * There is no real sign-in yet, so the sample student is shown as signed in by default. Turning this
 * on shows the guest header (Sign In / Sign Up) instead. It is NOT a session: nothing about the user
 * is stored, only this display preference.
 */
const STORAGE_KEY = 'unimarket.demo.guest-preview'
const listeners = new Set()

function load() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

let isGuestPreview = load()

export const guestPreview = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => isGuestPreview,
  set(value) {
    isGuestPreview = value
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, 'true')
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Not remembered after reload; still applies now.
    }
    listeners.forEach((listener) => listener())
  },
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    isGuestPreview = load()
    listeners.forEach((listener) => listener())
  }
})
