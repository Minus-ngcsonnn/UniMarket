import { REVIEW_COMMENT_MAX } from '../constants/review'

/** Review form: 1–5 stars required, comment optional (max 500 characters). The backend must check again. */
export function validateReview({ rating, comment }) {
  const errors = {}
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Choose a rating from 1 to 5 stars.'
  if (comment.trim().length > REVIEW_COMMENT_MAX) errors.comment = `Keep your comment under ${REVIEW_COMMENT_MAX} characters.`
  return errors
}

export const REPORT_DETAILS_MAX = 500

/** Report form: a reason is required; details are required for "Something else". */
export function validateReport({ reason, details }) {
  const errors = {}
  if (!reason) errors.reason = 'Choose what is wrong.'
  if (reason === 'OTHER' && details.trim().length < 10) errors.details = 'Tell us what is wrong in at least 10 characters.'
  if (details.trim().length > REPORT_DETAILS_MAX) errors.details = `Keep the details under ${REPORT_DETAILS_MAX} characters.`
  return errors
}
