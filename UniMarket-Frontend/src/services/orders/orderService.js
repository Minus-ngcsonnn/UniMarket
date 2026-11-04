// '@order-api-impl' is resolved by vite.config.js (sample data in development, real API in builds),
// in the same way as '@product-api-impl'.
import orderApiImpl from '@order-api-impl'
import { USE_MOCK_ORDERS } from '../../config/dataSource'

/** True when cart, checkout and orders use sample data (stored in this browser). */
export const isSampleOrders = USE_MOCK_ORDERS

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

  /** Real API: simulated shipping quotes per seller for a delivery area (signed, 15 minutes). */
  quoteShipping: (productIds, deliveryZoneId) => orderApiImpl.quoteShipping(productIds, deliveryZoneId),
  /** Real API: POST /api/checkout with delivery details and one quote token per seller. */
  checkout: mutation((request) => orderApiImpl.checkout(request)),
  /** Real API: start or resume a (simulated) payment attempt; does not mark the order paid. */
  startPayment: mutation((id, provider) => orderApiImpl.startPayment(id, provider)),
  /** Real API, sandbox only: finish a simulated payment; the server verifies and records the result. */
  completeSimulatedPayment: mutation((simulatorUrl, outcome) => orderApiImpl.completeSimulatedPayment(simulatorUrl, outcome)),

  /** Real API: ask an admin to review a paid order (no refund is executed; an admin decides). */
  openDispute: mutation((id, reason) => orderApiImpl.openDispute(id, reason)),

  // Buyer
  cancelOrder: mutation((id) => orderApiImpl.cancelOrder(id)),
  payOrder: mutation((id, method) => orderApiImpl.payOrder(id, method)),
  confirmReceived: mutation((id) => orderApiImpl.confirmReceived(id)),

  // Seller (whole order)
  confirmOrder: mutation((id) => orderApiImpl.confirmOrder(id)),
  declineOrder: mutation((id) => orderApiImpl.declineOrder(id)),
  markDelivering: mutation((id, shipment) => orderApiImpl.markDelivering(id, shipment)),

  /** Sample data only: plays the other person's next step so the whole flow can be tried alone. */
  simulateOtherParty: mutation((id) => orderApiImpl.simulateOtherParty(id)),

  /** Sample data only: forgets saved sample orders; reload the page afterwards. */
  resetSampleData: () => orderApiImpl.resetSampleData(),
}
