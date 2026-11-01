// '@order-api-impl' is resolved by vite.config.js (sample data in development, real API in builds),
// in the same way as '@product-api-impl'.
import orderApiImpl from '@order-api-impl'

/** Single entry point for orders (buyer and seller sides of the Business Plan flow). */
export const orderService = {
  /** @param {'buyer'|'seller'} role */
  listOrders: (role) => orderApiImpl.listOrders({ role }),
  getOrders: (ids) => orderApiImpl.getOrders(ids),
  /** One order per listing. @returns {Promise<{ orders, isSample }>} */
  placeOrders: (productIds, delivery) => orderApiImpl.placeOrders({ productIds, delivery }),

  // Buyer
  cancelOrder: (id) => orderApiImpl.cancelOrder(id),
  payOrder: (id, method) => orderApiImpl.payOrder(id, method),
  confirmReceived: (id) => orderApiImpl.confirmReceived(id),

  // Seller
  confirmOrder: (id) => orderApiImpl.confirmOrder(id),
  declineOrder: (id) => orderApiImpl.declineOrder(id),
  markDelivering: (id) => orderApiImpl.markDelivering(id),

  /** Sample data only: plays the other person's next step so the whole flow can be tried alone. */
  simulateOtherParty: (id) => orderApiImpl.simulateOtherParty(id),
}
