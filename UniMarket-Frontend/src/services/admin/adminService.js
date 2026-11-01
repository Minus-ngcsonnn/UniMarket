// '@admin-api-impl' is resolved by vite.config.js (sample data in development, real API in builds).
// Admin access must be enforced by the backend: the frontend only hides the admin pages.
import adminApiImpl from '@admin-api-impl'

/**
 * Single entry point for the admin dashboard.
 * Lists take { q, page, pageSize, campus, ... } and resolve with { items, total, page, pageSize, counts }.
 * Actions resolve with { saved: boolean }: saved=false means it was a preview and nothing changed.
 */
export const adminService = {
  getOverview: (params) => adminApiImpl.getOverview(params),
  /** { admin, pendingListings, openReports } for the sidebar and top bar. */
  getBadgeCounts: () => adminApiImpl.getBadgeCounts(),
  listListings: (params) => adminApiImpl.listListings(params),
  listUsers: (params) => adminApiImpl.listUsers(params),
  listReports: (params) => adminApiImpl.listReports(params),
  listOrders: (params) => adminApiImpl.listOrders(params),
  listCategories: (params) => adminApiImpl.listCategories(params),

  approveListing: (id) => adminApiImpl.approveListing(id),
  blockListing: (id, reason) => adminApiImpl.blockListing(id, reason),
  suspendUser: (id, reason) => adminApiImpl.suspendUser(id, reason),
  reactivateUser: (id) => adminApiImpl.reactivateUser(id),
  resolveReport: (id, resolution) => adminApiImpl.resolveReport(id, resolution),
  dismissReport: (id, resolution) => adminApiImpl.dismissReport(id, resolution),
  exportReport: (params) => adminApiImpl.exportReport(params),
}
