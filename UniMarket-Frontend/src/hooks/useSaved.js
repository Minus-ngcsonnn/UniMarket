import { useSyncExternalStore } from 'react'
import { savedStore } from '../services/saved/savedStore'

/** Saved listing IDs (newest first) and actions. Re-renders on changes, including other tabs. */
export default function useSaved() {
  const ids = useSyncExternalStore(savedStore.subscribe, savedStore.getSnapshot)
  return {
    ids,
    count: ids.length,
    has: (productId) => ids.includes(productId),
    toggle: savedStore.toggle,
    remove: savedStore.remove,
  }
}
