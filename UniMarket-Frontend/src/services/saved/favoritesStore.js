import apiClient from '../apiClient'
import { session } from '../auth/session'

/**
 * Saved items (favorites) from the database (Stage 6.2): GET / PUT / DELETE /api/me/favorites. The server list is the
 * only truth; nothing is kept in browser storage. Same subscribe / getSnapshot contract as savedStore.js.
 *
 * - Loaded when a session starts (or is restored) and cleared when it ends, so different accounts never share hearts.
 * - toggle() updates the heart at once (optimistic) and rolls back if the request fails. While a request for a listing
 *   is running, further clicks on it are ignored (no duplicate requests). PUT is idempotent on the server (200 when
 *   already saved); DELETE answers 204 also when it was not saved.
 * - Anonymous visitors get { needsLogin: true } instead of a change.
 */

const listeners = new Set()
let state = { status: 'idle', ids: [], userId: null, error: null }
const inFlight = new Set()
let loadSequence = 0

function setState(next) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

async function load(userId) {
  const sequence = ++loadSequence
  setState({ status: 'loading', userId, error: null })
  try {
    const { data } = await apiClient.get('/me/favorites')
    if (sequence !== loadSequence) return
    setState({ status: 'ready', ids: data.map((item) => item.id), error: null })
  } catch (error) {
    if (sequence !== loadSequence) return
    setState({ status: 'error', error })
  }
}

function followSession() {
  const { status, user } = session.getSnapshot()
  const userId = status === 'authenticated' ? (user?.id ?? null) : null
  if (userId === state.userId && state.status !== 'idle') return
  if (userId == null) {
    loadSequence++
    inFlight.clear()
    setState({ status: status === 'restoring' ? 'loading' : 'anonymous', ids: [], userId: null, error: null })
  } else {
    load(userId)
  }
}

export const favoritesStore = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,

  /** Starts following the session (called once by the saved-items hook module). */
  start() {
    session.subscribe(followSession)
    followSession()
  },

  /** Re-reads the list from the server (e.g. when the Saved items page opens). */
  refresh() {
    if (state.userId != null) return load(state.userId)
    return Promise.resolve()
  },

  /**
   * Saves or un-saves a listing.
   * @returns {Promise<{ saved?: boolean, needsLogin?: boolean, ignored?: boolean }>}
   * @throws ApiError when the server refused (the heart is restored first), e.g. 404 for a listing that is no longer public
   */
  async toggle(productId) {
    if (state.userId == null) return { needsLogin: true }
    if (inFlight.has(productId)) return { ignored: true }
    const wasSaved = state.ids.includes(productId)
    const userId = state.userId
    inFlight.add(productId)
    setState({ ids: wasSaved ? state.ids.filter((id) => id !== productId) : [productId, ...state.ids] })
    try {
      if (wasSaved) await apiClient.delete(`/me/favorites/${productId}`)
      else await apiClient.put(`/me/favorites/${productId}`)
      return { saved: !wasSaved }
    } catch (error) {
      if (state.userId === userId) {
        setState({ ids: wasSaved ? [productId, ...state.ids.filter((id) => id !== productId)] : state.ids.filter((id) => id !== productId) })
      }
      throw error
    } finally {
      inFlight.delete(productId)
    }
  },

  /** Un-saves several listings (e.g. "Remove reserved and sold"). Failed ones stay saved. */
  async remove(productIds) {
    if (state.userId == null) return
    const removed = [].concat(productIds)
    const results = await Promise.allSettled(removed.map((id) => apiClient.delete(`/me/favorites/${id}`)))
    const done = new Set(removed.filter((_, index) => results[index].status === 'fulfilled'))
    setState({ ids: state.ids.filter((id) => !done.has(id)) })
  },
}
