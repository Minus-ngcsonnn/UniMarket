/**
 * Review rules (approved, Business Plan: "after a completed transaction both sides review each other"):
 * - only COMPLETED orders can be reviewed;
 * - the buyer reviews the seller and the seller reviews the buyer: one review per side per order;
 * - 1–5 stars required, comment optional (max 500 characters);
 * - a review can't be edited after it is submitted.
 * The backend must enforce these rules; the frontend only guides the user.
 */
export const REVIEW_COMMENT_MAX = 500
export const RATING_LABELS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' }
