/**
 * Shopping cart kept in this browser (localStorage) until the backend cart exists.
 * It stores only listing IDs and whether each one is selected for checkout; product details,
 * prices and availability are always loaded fresh from the product service.
 * No account data, tokens or prices are stored here.
 *
 * Exposes a tiny external store for React's useSyncExternalStore (see hooks/useCart.js).
 */
const STORAGE_KEY = 'unimarket.cart.v1'
const listeners = new Set()

function load() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => Number.isFinite(item?.productId)) : []
  } catch {
    return []
  }
}

let items = load() // [{ productId: number, selected: boolean }]

function commit(next) {
  items = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage full or blocked: the cart still works for this page session.
  }
  listeners.forEach((listener) => listener())
}

// Keep several open tabs in sync.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    items = load()
    listeners.forEach((listener) => listener())
  }
})

export const cartStore = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => items,

  has: (productId) => items.some((item) => item.productId === productId),

  /** @returns {boolean} false when the listing was already in the cart */
  add(productId) {
    if (cartStore.has(productId)) return false
    commit([...items, { productId, selected: true }])
    return true
  },
  remove(productIds) {
    const ids = new Set([].concat(productIds))
    commit(items.filter((item) => !ids.has(item.productId)))
  },
  setSelected(productId, selected) {
    commit(items.map((item) => (item.productId === productId ? { ...item, selected } : item)))
  },
  setAllSelected(selected) {
    commit(items.map((item) => ({ ...item, selected })))
  },
}
