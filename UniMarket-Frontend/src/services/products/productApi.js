/**
 * Real product API (UniMarket backend). NOT AVAILABLE YET.
 *
 * The backend endpoints depend on the SQL Server schema that is still being designed, so no HTTP
 * contract has been agreed. Every function rejects with BackendPendingError until then.
 * When the API exists, implement these functions with apiClient, keeping the same signatures and
 * return shapes as src/mocks/mockProductApi.js, which the pages already rely on.
 */

export class BackendPendingError extends Error {
  constructor(feature) {
    super(`${feature} isn’t connected to the UniMarket backend yet.`)
    this.name = 'BackendPendingError'
  }
}

const pending = (feature) => () => Promise.reject(new BackendPendingError(feature))

export default {
  listProducts: pending('The product catalog'),
  getProduct: pending('Product details'),
  getProductsByIds: pending('Cart items'),
  listUserListings: pending('Student listings'),
  getCurrentUserId: () => null, // no sign-in yet

  listMyListings: pending('My listings'),
  getMyListing: pending('Editing listings'),
  createListing: pending('Publishing listings'),
  updateListing: pending('Saving listing changes'),
  deleteListing: pending('Deleting listings'),
}
