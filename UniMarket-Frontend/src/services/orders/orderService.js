// '@order-api-impl' is resolved by vite.config.js (sample data in development, real API in builds),
// in the same way as '@product-api-impl'.
import orderApiImpl from '@order-api-impl'

const listeners = new Set()

/** Subscribe to "orders changed in this tab" (after any order action). Returns an unsubscribe function. */
export function onOrdersChanged(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Runs an order action, then tells subscribers (header badge, open order pages) to refresh. */
function mutation(action) {
  return async (...args) => {
    const result = await action(...args)
    listeners.forEach((listener) => listener())
    return result
  }
}

/** Single entry point for orders (buyer and seller sides of the Business Plan flow). */
export const orderService = {
  /** @param {'buyer'|'seller'} role */
  listOrders: (role) => orderApiImpl.listOrders({ role }),
  /** One order where the signed-in student is buyer or seller (includes `role`), or null. */
  getOrder: (id) => orderApiImpl.getOrder(id),
  getOrders: (ids) => orderApiImpl.getOrders(ids),
  /** { buyer, seller }: orders waiting for the signed-in student to act. */
  getActionCounts: () => orderApiImpl.getActionCounts(),
  /** Groups the listings by seller: one order per seller (Q3). @returns {Promise<{ orders, isSample }>} */
  placeOrders: mutation((productIds, delivery) => orderApiImpl.placeOrders({ productIds, delivery })),

  // Buyer
  cancelOrder: mutation((id) => orderApiImpl.cancelOrder(id)),
  payOrder: mutation((id, method) => orderApiImpl.payOrder(id, method)),
  confirmReceived: mutation((id) => orderApiImpl.confirmReceived(id)),

  // Seller (whole order)
  confirmOrder: mutation((id) => orderApiImpl.confirmOrder(id)),
  declineOrder: mutation((id) => orderApiImpl.declineOrder(id)),
  markDelivering: mutation((id) => orderApiImpl.markDelivering(id)),

  /** Sample data only: plays the other person's next step so the whole flow can be tried alone. */
  simulateOtherParty: mutation((id) => orderApiImpl.simulateOtherParty(id)),

  /** Sample data only: forgets saved sample orders; reload the page afterwards. */
  resetSampleData: () => orderApiImpl.resetSampleData(),
}
