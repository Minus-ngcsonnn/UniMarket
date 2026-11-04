import apiClient from '../apiClient'
import { session } from '../auth/session'

/**
 * Shopping cart in the database (Stage 6.3): GET / PUT / DELETE /api/cart. Same snapshot shape as cartStore.js
 * ([{ productId, selected }]) so the cart page and header work unchanged. The server list is the truth; only the
 * "selected for checkout" ticks live in this tab (all ticked by default).
 *
 * - Loaded when a session starts (or is restored), cleared on sign-out: accounts never share a cart.
 * - One unit per listing (second-hand): adding an item that is already there changes nothing (200).
 * - add() resolves to { added } or { needsLogin } and rejects with the ApiError the server sent:
 *   409 OWN_LISTING, 409 LISTING_UNAVAILABLE, 404 (not public), 400 CART_FULL.
 */

const listeners = new Set()
let state = { status: 'idle', userId: null, items: [], error: null }
const deselected = new Set()
let sequence = 0

function setState(next) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function itemsOf(cart) {
  const ids = [...cart.groups.flatMap((group) => group.items), ...cart.unavailable]
    .sort((a, b) => new Date(a.addedAt ?? 0) - new Date(b.addedAt ?? 0))
    .map((item) => item.productId)
  return [...new Set(ids)].map((productId) => ({ productId, selected: !deselected.has(productId) }))
}

async function load(userId) {
  const run = ++sequence
  setState({ status: state.userId === userId && state.status === 'ready' ? 'ready' : 'loading', userId, error: null })
  try {
    const { data } = await apiClient.get('/cart')
    if (run === sequence) setState({ status: 'ready', items: itemsOf(data), error: null })
  } catch (error) {
    if (run === sequence) setState({ status: 'error', error })
  }
}

function followSession() {
  const { status, user } = session.getSnapshot()
  const userId = status === 'authenticated' ? (user?.id ?? null) : null
  if (userId === state.userId && state.status !== 'idle') return
  deselected.clear()
  if (userId == null) {
    sequence++
    setState({ status: status === 'restoring' ? 'loading' : 'anonymous', userId: null, items: [], error: null })
  } else {
    load(userId)
  }
}

const reselect = () => setState({ items: state.items.map((item) => ({ ...item, selected: !deselected.has(item.productId) })) })

export const backendCartStore = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,

  start() {
    session.subscribe(followSession)
    followSession()
  },

  /** Re-reads the cart (after checkout, or when the cart page opens). */
  refresh() {
    return state.userId != null ? load(state.userId) : Promise.resolve()
  },

  has: (productId) => state.items.some((item) => item.productId === productId),

  async add(productId) {
    if (state.userId == null) return { needsLogin: true }
    const { data } = await apiClient.put(`/cart/items/${productId}`)
    deselected.delete(productId)
    if (!state.items.some((item) => item.productId === productId)) {
      setState({ items: [...state.items, { productId, selected: true }] })
    }
    return { added: Boolean(data?.added) }
  },

  /** Removes listings; failed removals stay in the cart (the list is re-read afterwards). */
  async remove(productIds) {
    if (state.userId == null) return
    const ids = [].concat(productIds)
    await Promise.allSettled(ids.map((id) => apiClient.delete(`/cart/items/${id}`)))
    ids.forEach((id) => deselected.delete(id))
    await load(state.userId)
  },

  setSelected(productId, selected) {
    if (selected) deselected.delete(productId)
    else deselected.add(productId)
    reselect()
  },

  setAllSelected(selected) {
    state.items.forEach((item) => (selected ? deselected.delete(item.productId) : deselected.add(item.productId)))
    reselect()
  },
}
