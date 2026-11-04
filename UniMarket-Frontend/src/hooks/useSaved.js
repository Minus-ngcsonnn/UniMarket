import { useSyncExternalStore } from 'react'
import { USE_MOCK_PRODUCTS } from '../config/dataSource'
import { favoritesStore } from '../services/saved/favoritesStore'
import { savedStore } from '../services/saved/savedStore'

if (!USE_MOCK_PRODUCTS) favoritesStore.start()

/**
 * Saved listings (newest first) and actions.
 * - Real API: favorites of the signed-in account from the database; toggle() resolves to { saved } or { needsLogin }
 *   and rejects with the ApiError when the server refused (the heart is restored).
 * - Sample data: IDs kept in this browser; toggle() resolves to { saved } at once.
 * @returns {{ ids: number[], count: number, has: (id) => boolean, toggle: (id) => Promise<object>,
 *   remove: (ids) => Promise<void>, isBackend: boolean, status: string, error: Error|null, refresh: () => Promise<void> }}
 */
export default function useSaved() {
  const sampleIds = useSyncExternalStore(savedStore.subscribe, savedStore.getSnapshot)
  const backend = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)

  if (!USE_MOCK_PRODUCTS) {
    return {
      ids: backend.ids,
      count: backend.ids.length,
      has: (productId) => backend.ids.includes(productId),
      toggle: favoritesStore.toggle,
      remove: favoritesStore.remove,
      isBackend: true,
      status: backend.status,
      error: backend.error,
      refresh: favoritesStore.refresh,
    }
  }
  return {
    ids: sampleIds,
    count: sampleIds.length,
    has: (productId) => sampleIds.includes(productId),
    toggle: (productId) => Promise.resolve({ saved: savedStore.toggle(productId) }),
    remove: (productIds) => Promise.resolve(savedStore.remove(productIds)),
    isBackend: false,
    status: 'ready',
    error: null,
    refresh: () => Promise.resolve(),
  }
}
