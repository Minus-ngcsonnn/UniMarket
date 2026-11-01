/**
 * Saved items (wishlist) kept in this browser (localStorage) until accounts and a backend list exist.
 * Like the cart, it stores only listing IDs, newest first; listing details are always loaded fresh.
 * It is a personal shortcut only: saving doesn't reserve the item or notify the seller.
 */
const STORAGE_KEY = 'unimarket.saved.v1'
const listeners = new Set()

function load() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : []
  } catch {
    return []
  }
}

let ids = load()

function commit(next) {
  ids = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage full or blocked: saved items still work for this page session.
  }
  listeners.forEach((listener) => listener())
}

// Keep several open tabs in sync.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    ids = load()
    listeners.forEach((listener) => listener())
  }
})

export const savedStore = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => ids,
  /** Adds or removes a listing. @returns {boolean} true when it is now saved */
  toggle(productId) {
    const isSaved = ids.includes(productId)
    commit(isSaved ? ids.filter((id) => id !== productId) : [productId, ...ids])
    return !isSaved
  },
  remove(productIds) {
    const removed = new Set([].concat(productIds))
    commit(ids.filter((id) => !removed.has(id)))
  },
}
