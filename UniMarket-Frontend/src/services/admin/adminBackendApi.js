import apiClient from '../apiClient'

/**
 * Real admin API (docs/ADMIN_API.md, Stage 5). `/api/admin/**` is ADMIN-only on the server (401 without a token, 403 for
 * students); hiding admin pages in the frontend is only a convenience. Every admin change is written to
 * dbo.AdminActions by the backend. Responses are the backend's JSON (the live admin pages use them directly); money is
 * shown as returned, never recalculated.
 */

const page = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null))
const get = async (path, params) => (await apiClient.get(path, params ? { params: page(params) } : undefined)).data
const post = async (path, body) => (await apiClient.post(path, body ?? {})).data

export const adminBackendApi = {
  /** { period, users, listings, orders, finance, settlements, disputes, reports, promotions }; from / to = UTC days. */
  dashboard: (from, to) => get('/admin/dashboard', { from, to }),
  /** { pendingListings, openReports, openDisputes, pendingSettlements } */
  badges: () => get('/admin/badges'),

  // Listing moderation (PENDING oldest first)
  listings: ({ moderation = 'PENDING', q, page: p = 1, size = 20 } = {}) => get('/admin/listings', { moderation, q, page: p, size }),
  listingCounts: () => get('/admin/listings/counts'),
  /** Detail with description, images, `version` (the reviewed version), openReports and history. */
  listing: (id) => get(`/admin/listings/${id}`),
  approveListing: (id, version, note) => post(`/admin/listings/${id}/approve`, note ? { version, note } : { version }),
  rejectListing: (id, version, reason) => post(`/admin/listings/${id}/reject`, { version, reason }),
  blockListing: (id, reason) => post(`/admin/listings/${id}/block`, { reason }),
  removeListing: (id, reason) => post(`/admin/listings/${id}/remove`, { reason }),

  // Accounts (no endpoint changes a role)
  users: ({ q, status, role = 'ALL', page: p = 1, size = 20 } = {}) => get('/admin/users', { q, status, role, page: p, size }),
  user: (id) => get(`/admin/users/${id}`),
  suspendUser: (id, reason) => post(`/admin/users/${id}/suspend`, { reason }),
  reactivateUser: (id, reason) => post(`/admin/users/${id}/reactivate`, reason ? { reason } : {}),

  // Orders (read only for admins)
  orders: ({ status, page: p = 1, size = 20 } = {}) => get('/admin/orders', { status, page: p, size }),
  order: (id) => get(`/admin/orders/${id}`),

  // Violation reports
  reports: ({ status = 'ACTIVE', targetType, page: p = 1, size = 20 } = {}) => get('/admin/reports', { status, targetType, page: p, size }),
  report: (id) => get(`/admin/reports/${id}`),
  reviewReport: (id) => post(`/admin/reports/${id}/review`),
  resolveReport: (id, resolution) => post(`/admin/reports/${id}/resolve`, { resolution }),
  dismissReport: (id, resolution) => post(`/admin/reports/${id}/dismiss`, { resolution }),

  // Order disputes (no refund is ever executed by UniMarket)
  disputes: ({ status = 'OPEN', page: p = 1, size = 20 } = {}) => get('/admin/disputes', { status, page: p, size }),
  dispute: (id) => get(`/admin/disputes/${id}`),
  resolveDispute: (id, decision, resolution) => post(`/admin/disputes/${id}/resolve`, { decision, resolution }),
  confirmRefund: (id, refundReference) => post(`/admin/disputes/${id}/confirm-refund`, { refundReference }),

  // Seller settlements (release records a payout made outside UniMarket; moves no money)
  settlements: ({ status = 'PENDING', onHold, page: p = 1, size = 20 } = {}) => get('/admin/settlements', { status, onHold, page: p, size }),
  settlement: (orderId) => get(`/admin/settlements/${orderId}`),
  releaseSettlement: (orderId, payoutReference, note, acknowledgeSimulated) =>
    post(`/admin/settlements/${orderId}/release`, { payoutReference, ...(note ? { note } : {}), acknowledgeSimulated: Boolean(acknowledgeSimulated) }),

  // Read-only reference data
  categories: () => get('/categories'),
}

/** Backend refusals of admin actions → text for the admin. */
const ADMIN_ERRORS = {
  LISTING_CHANGED: 'The seller changed this listing while you were reviewing it. The new version was loaded: review it again.',
  MODERATION_CONFLICT: 'This listing is not in a state that allows this action (it may be reserved, sold or removed).',
  ACCOUNT_STATE_CONFLICT: 'This account can’t be changed this way (admins, your own account, or already in that state).',
  REPORT_STATE_CONFLICT: 'This report has already been handled.',
  DISPUTE_STATE_CONFLICT: 'This dispute is not in a state that allows this action.',
  SETTLEMENT_ON_HOLD: 'The payout is on hold: the order has an open dispute or an approved refund.',
  SETTLEMENT_STATE_CONFLICT: 'This settlement is not pending (it may already be released).',
  ACCESS_DENIED: 'Only admins can do this.',
}

export function adminErrorText(error) {
  if (ADMIN_ERRORS[error?.code]) return ADMIN_ERRORS[error.code]
  if (error?.code === 'VALIDATION_FAILED' && error.fieldErrors?.length) return error.fieldErrors.map((f) => `${f.field}: ${f.message}`).join(' · ')
  return error?.message ?? 'Something went wrong.'
}

const listeners = new Set()

/** Subscribe to "an admin action changed data" (badges, lists). Returns an unsubscribe function. */
export function onAdminChanged(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Runs an admin action for AdminActionDialog: resolves { saved: true } or throws an Error with readable text. */
export async function runAdminAction(action) {
  try {
    await action()
    listeners.forEach((listener) => listener())
    return { saved: true }
  } catch (error) {
    const wrapped = new Error(adminErrorText(error))
    wrapped.code = error?.code
    throw wrapped
  }
}
