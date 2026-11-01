import { useSyncExternalStore } from 'react'
import { cartStore } from '../services/cart/cartStore'

/**
 * Current cart items ([{ productId, selected }]) plus cart actions. Re-renders on any cart change,
 * including changes made in another tab.
 */
export default function useCart() {
  const items = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot)
  return {
    items,
    count: items.length,
    has: (productId) => items.some((item) => item.productId === productId),
    add: cartStore.add,
    remove: cartStore.remove,
    setSelected: cartStore.setSelected,
    setAllSelected: cartStore.setAllSelected,
  }
}
