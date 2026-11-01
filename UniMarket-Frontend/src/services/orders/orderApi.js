/**
 * Real order API (UniMarket backend). NOT AVAILABLE YET: orders, payments and the related tables
 * depend on the SQL Server schema that is still being designed.
 * Implement with apiClient later, keeping the signatures and return shapes of src/mocks/mockOrderApi.js.
 */
import { BackendPendingError } from '../products/productApi'

const pending = (feature) => () => Promise.reject(new BackendPendingError(feature))

export default {
  listOrders: pending('Orders'),
  getOrders: pending('Orders'),
  placeOrders: pending('Placing orders'),
  cancelOrder: pending('Cancelling orders'),
  payOrder: pending('Online payment'),
  confirmReceived: pending('Confirming delivery'),
  confirmOrder: pending('Confirming orders'),
  declineOrder: pending('Declining orders'),
  markDelivering: pending('Delivery updates'),
  simulateOtherParty: pending('Order simulation'),
}
