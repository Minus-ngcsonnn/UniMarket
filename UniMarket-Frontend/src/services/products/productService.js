// '@product-api-impl' is resolved by vite.config.js:
//   - src/mocks/mockProductApi.js (sample data) when USE_MOCK_DATA is true, e.g. `npm run dev`
//   - src/services/products/productApi.js (real backend) otherwise (VITE_USE_MOCK_PRODUCTS=false, or real sign-in)
// Both modules export the same functions, so pages never need to know which one is used.
import productApiImpl from '@product-api-impl'
import { USE_MOCK_PRODUCTS } from '../../config/dataSource'

/** True when the UI is showing sample data (used to label pages clearly). */
export const isSampleData = USE_MOCK_PRODUCTS

/** Single entry point for product data used by pages and components. */
export const productService = {
  listProducts: (params) => productApiImpl.listProducts(params),
  getProduct: (id) => productApiImpl.getProduct(id),
  getProductsByIds: (ids) => productApiImpl.getProductsByIds(ids),
  /** Public, approved listings of one student (profile page). */
  listUserListings: (userId) => productApiImpl.listUserListings(userId),
  /** Signed-in student's ID (sample user in development), or null. */
  getCurrentUserId: () => productApiImpl.getCurrentUserId(),
  listMyListings: () => productApiImpl.listMyListings(),
  getMyListing: (id) => productApiImpl.getMyListing(id),
  /** @returns {Promise<{ saved: boolean }>} saved=false means nothing was stored (preview) */
  createListing: (listing, options) => productApiImpl.createListing(listing, options),
  updateListing: (id, listing, options) => productApiImpl.updateListing(id, listing, options),
  deleteListing: (id) => productApiImpl.deleteListing(id),
}
