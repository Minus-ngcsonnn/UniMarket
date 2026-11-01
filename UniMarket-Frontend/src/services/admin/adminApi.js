/**
 * Real admin API. NOT AVAILABLE YET: it depends on the database schema, authentication and
 * role checks that are still being built. The backend MUST check that the caller is an admin on every
 * request; hiding admin pages in the frontend is not security.
 * Implement with apiClient later, keeping the signatures and return shapes of src/mocks/mockAdminApi.js.
 */
import { BackendPendingError } from '../products/productApi'

const pending = (feature) => () => Promise.reject(new BackendPendingError(feature))

export default {
  getOverview: pending('Admin statistics'),
  listListings: pending('Listing moderation'),
  listUsers: pending('User management'),
  listReports: pending('Violation reports'),
  listOrders: pending('Admin order list'),
  listCategories: pending('Categories'),
  getBadgeCounts: pending('Admin notifications'),
  approveListing: pending('Approving listings'),
  blockListing: pending('Blocking listings'),
  suspendUser: pending('Suspending accounts'),
  reactivateUser: pending('Reactivating accounts'),
  resolveReport: pending('Resolving reports'),
  dismissReport: pending('Dismissing reports'),
  exportReport: pending('Exporting reports'),
}
