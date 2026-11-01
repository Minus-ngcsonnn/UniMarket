/**
 * Real account API (profiles, reviews, violation reports). NOT AVAILABLE YET: users, reviews and
 * reports depend on the SQL Server schema and the authentication API that are still being built.
 * Implement with apiClient later, keeping the signatures and return shapes of src/mocks/mockAccountApi.js.
 * The backend must enforce the review rules (see src/constants/review.js) and who may see private fields.
 */
import { BackendPendingError } from '../products/productApi'

const pending = (feature) => () => Promise.reject(new BackendPendingError(feature))

export default {
  getMyProfile: pending('Your profile'),
  getUserProfile: pending('Student profiles'),
  updateProfile: pending('Saving your profile'),
  listUserReviews: pending('Reviews'),
  getRatingSummary: pending('Ratings'),
  getOrderReviews: pending('Order reviews'),
  submitReview: pending('Submitting reviews'),
  createReport: pending('Reporting'),
}
