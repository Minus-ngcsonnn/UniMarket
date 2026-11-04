import apiClient from '../apiClient'
import { session } from '../auth/session'
import { BackendPendingError } from '../products/productApi'
import { toPublicProfile, toRating, toReview } from './accountMapper'

/**
 * Real profiles, reviews and violation reports (docs/ADMIN_API.md §4–5, Stage 5 endpoints). Same functions and shapes
 * as src/mocks/mockAccountApi.js. Selected by vite.config.js (VITE_USE_MOCK_ADMIN). Text from users (comments, report
 * details) is returned as plain text and rendered by React as text, never as HTML.
 */

const isId = (value) => /^\d{1,9}$/.test(String(value))
const notFoundToNull = (error) => {
  if (error?.status === 404) return null
  throw error
}

async function getUserProfile(userId) {
  if (!isId(userId)) return null
  return apiClient.get(`/users/${userId}`).then(({ data }) => toPublicProfile(data), notFoundToNull)
}

/** The signed-in account's public profile (GET /api/users/{me}); private fields stay in GET /api/auth/me. */
async function getMyProfile() {
  const id = session.getSnapshot().user?.id
  return id ? getUserProfile(id) : null
}

/** Reviews a person received, newest first. role BUYER = written by buyers (about them as a seller). */
async function listUserReviews(userId, { role } = {}) {
  if (!isId(userId)) return []
  const params = { size: 50 }
  if (role) params.role = role === 'BUYER' ? 'SELLER' : 'BUYER' // API role = the reviewee's side
  const { data } = await apiClient.get(`/users/${userId}/reviews`, { params })
  return data.items.map(toReview)
}

async function getRatingSummary(userId) {
  if (!isId(userId)) return toRating(null)
  const { data } = await apiClient.get(`/users/${userId}/ratings`)
  return toRating(data)
}

/** { canReview, mine, theirs } for one order of the signed-in account (participants only). */
async function getOrderReviews(orderId) {
  const { data } = await apiClient.get(`/orders/${orderId}/reviews`)
  return { canReview: Boolean(data.canReview), mine: toReview(data.mine), theirs: toReview(data.theirs) }
}

/** POST /api/orders/{id}/reviews: only after COMPLETED, once per side; the reviewee is decided by the server. */
async function submitReview({ orderId, rating, comment = '' }) {
  const text = comment.trim()
  const { data } = await apiClient.post(`/orders/${orderId}/reviews`, text ? { rating, comment: text } : { rating })
  return { review: toReview(data), isSample: false }
}

/** POST /api/reports (listing or student account). One unhandled report per reporter and target. */
async function createReport({ targetType, targetId, reason, details = '' }) {
  const text = details.trim()
  await apiClient.post('/reports', { targetType, targetId: Number(targetId), reason, ...(text ? { details: text } : {}) })
  return { saved: true }
}

/** Editing the profile is not connected yet (contact settings exist: GET/PUT /api/me/contact). */
const updateProfile = () => Promise.reject(new BackendPendingError('Saving your profile'))

export default {
  getMyProfile,
  getUserProfile,
  updateProfile,
  listUserReviews,
  getRatingSummary,
  getOrderReviews,
  submitReview,
  createReport,
}
