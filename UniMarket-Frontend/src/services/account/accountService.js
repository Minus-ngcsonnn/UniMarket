// '@account-api-impl' is resolved by vite.config.js (sample data in development, real API in builds),
// in the same way as '@product-api-impl'.
import accountApiImpl from '@account-api-impl'

const reviewListeners = new Set()

/** Subscribe to "a review was submitted in this tab" (order pages, profiles). Returns an unsubscribe function. */
export function onReviewsChanged(listener) {
  reviewListeners.add(listener)
  return () => reviewListeners.delete(listener)
}

/** Single entry point for profiles, reviews and violation reports. */
export const accountService = {
  /** Signed-in student's own profile, with `rating` and `stats`. */
  getMyProfile: () => accountApiImpl.getMyProfile(),
  /** Public profile (no email), or null when the account does not exist. */
  getUserProfile: (userId) => accountApiImpl.getUserProfile(userId),
  /** @returns {Promise<{ saved: boolean }>} saved=false means nothing was stored (preview) */
  updateProfile: (values) => accountApiImpl.updateProfile(values),

  /** @param {{ role?: 'BUYER'|'SELLER' }} [filter] reviews written by buyers or by sellers */
  listUserReviews: (userId, filter) => accountApiImpl.listUserReviews(userId, filter),
  /** { average, count, distribution } */
  getRatingSummary: (userId) => accountApiImpl.getRatingSummary(userId),
  /** { canReview, mine, theirs } for one order of the signed-in student. */
  getOrderReviews: (orderId) => accountApiImpl.getOrderReviews(orderId),
  /** Reviews the other student of a COMPLETED order (one review per side, not editable). */
  submitReview: async (review) => {
    const result = await accountApiImpl.submitReview(review)
    reviewListeners.forEach((listener) => listener())
    return result
  },

  /** Reports a listing or a student to the admins. @returns {Promise<{ saved: boolean }>} */
  createReport: (report) => accountApiImpl.createReport(report),
}
