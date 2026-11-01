/**
 * SAMPLE DATA PERSISTENCE (development only).
 * Keeps sample orders and the listing statuses they changed (Reserved / Sold) in this browser's
 * localStorage, so sample data survives page reloads and is shared between open tabs.
 * Real data will live in the backend; this module is never part of production builds.
 */
const STORAGE_KEY = 'unimarket.sample-data.v1'

/** @returns {{ orders: object[], nextOrderId: number, productStatuses: Record<string, string> } | null} */
export function loadSampleState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    return saved && Array.isArray(saved.orders) ? saved : null
  } catch {
    return null
  }
}

export function saveSampleState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: sample data still works until the page is reloaded.
  }
}

export function clearSampleState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Applies saved listing statuses (e.g. RESERVED after an order) to the sample products. */
export function applySavedProductStatuses(products) {
  const statuses = loadSampleState()?.productStatuses
  if (!statuses) return
  products.forEach((product) => {
    if (statuses[product.id]) product.status = statuses[product.id]
  })
}
