/**
 * Moderation rules (approved decisions). Separate from a listing's sale status (Available/Reserved/Sold).
 *
 * Listings — PRE-MODERATION (Figma admin): new or edited listings are "Pending review" and hidden
 * from the marketplace until an admin approves them (Active); Block hides them with a reason.
 */
export const LISTING_MODERATION = {
  PENDING: { label: 'Pending', sellerLabel: 'Pending review', tone: 'warning' },
  APPROVED: { label: 'Active', sellerLabel: 'Approved', tone: 'success' },
  BLOCKED: { label: 'Blocked', sellerLabel: 'Blocked', tone: 'danger' },
}
export const LISTING_MODERATION_KEYS = Object.keys(LISTING_MODERATION)

/** Approved listings are public. A listing without a moderation field counts as approved. */
export const isPubliclyListed = (product) => (product?.moderation ?? 'APPROVED') === 'APPROVED'

/** Can be ordered: approved by an admin and still available. */
export const isPurchasable = (product) => product?.status === 'AVAILABLE' && isPubliclyListed(product)

/** Student account status (admin can suspend accounts that break the rules). */
export const ACCOUNT_STATUSES = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
}

/** Violation reports (Business Plan: admin handles violation reports). */
export const REPORT_STATUSES = {
  OPEN: { label: 'Open', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  DISMISSED: { label: 'Dismissed', tone: 'neutral' },
}

export const REPORT_REASONS = [
  { value: 'MISLEADING', label: 'Misleading or wrong description' },
  { value: 'PROHIBITED', label: 'Prohibited or unsafe item' },
  { value: 'OFF_PLATFORM_PAYMENT', label: 'Asked to pay outside UniMarket' },
  { value: 'FAKE', label: 'Fake, stolen or counterfeit' },
  { value: 'HARASSMENT', label: 'Harassment or abusive behaviour' },
  { value: 'SPAM', label: 'Spam or duplicate' },
  { value: 'OTHER', label: 'Something else' },
]
export const reportReasonLabel = (value) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value

/** Human-readable report number, e.g. RP-501. */
export const reportCode = (id) => `RP-${id}`
