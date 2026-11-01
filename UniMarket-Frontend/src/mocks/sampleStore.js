/**
 * SAMPLE DATA PERSISTENCE (development only).
 * Keeps sample orders, the listing statuses they changed (Reserved / Sold) and reviews written in the
 * demo in this browser's localStorage, so sample data survives page reloads and is shared between tabs.
 * Real data will live in the backend; this module is never part of production builds.
 */
const STORAGE_KEY = 'unimarket.sample-data.v1'
const REVIEWS_KEY = 'unimarket.sample-reviews.v1'

function read(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: sample data still works until the page is reloaded.
  }
}

/** @returns {{ orders: object[], nextOrderId: number, productStatuses: Record<string, string> } | null} */
export function loadSampleState() {
  const saved = read(STORAGE_KEY)
  return saved && Array.isArray(saved.orders) ? saved : null
}

export function saveSampleState(state) {
  write(STORAGE_KEY, state)
}

/** Reviews submitted in the demo (not the seed reviews). */
export function loadSampleReviews() {
  const saved = read(REVIEWS_KEY)
  return Array.isArray(saved) ? saved : []
}

export function saveSampleReviews(reviews) {
  write(REVIEWS_KEY, reviews)
}

/** Forgets everything the demo saved (orders, listing statuses, reviews). */
export function clearSampleState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(REVIEWS_KEY)
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
