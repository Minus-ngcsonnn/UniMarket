import { useSyncExternalStore } from 'react'
import { USE_MOCK_ORDERS } from '../config/dataSource'
import { backendCartStore } from '../services/cart/backendCartStore'
import { cartStore } from '../services/cart/cartStore'

if (!USE_MOCK_ORDERS) backendCartStore.start()

/**
 * Current cart items ([{ productId, selected }]) plus cart actions. Re-renders on any cart change.
 * - Real API: the signed-in account's cart in the database (GET/PUT/DELETE /api/cart). add() resolves to
 *   { added } or { needsLogin } and rejects with the server's ApiError (OWN_LISTING, LISTING_UNAVAILABLE, …).
 * - Sample data: listing IDs kept in this browser; add() resolves to { added } at once.
 */
export default function useCart() {
  const sampleItems = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot)
  const backend = useSyncExternalStore(backendCartStore.subscribe, backendCartStore.getSnapshot)

  if (!USE_MOCK_ORDERS) {
    return {
      items: backend.items,
      count: backend.items.length,
      has: (productId) => backend.items.some((item) => item.productId === productId),
      add: backendCartStore.add,
      remove: backendCartStore.remove,
      setSelected: backendCartStore.setSelected,
      setAllSelected: backendCartStore.setAllSelected,
      refresh: backendCartStore.refresh,
      isBackend: true,
      status: backend.status,
      error: backend.error,
    }
  }
  return {
    items: sampleItems,
    count: sampleItems.length,
    has: (productId) => sampleItems.some((item) => item.productId === productId),
    add: (productId) => Promise.resolve({ added: cartStore.add(productId) }),
    remove: (productIds) => Promise.resolve(cartStore.remove(productIds)),
    setSelected: cartStore.setSelected,
    setAllSelected: cartStore.setAllSelected,
    refresh: () => Promise.resolve(),
    isBackend: false,
    status: 'ready',
    error: null,
  }
}
