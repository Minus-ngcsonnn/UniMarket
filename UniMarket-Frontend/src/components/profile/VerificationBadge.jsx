import { BadgeCheckIcon, MailIcon } from '../icons'

/**
 * Verification shown on profiles (Q1): "Verified student" for a verified @fpt.edu.vn email,
 * "Email verified" for a verified personal email. Unverified accounts show nothing publicly.
 */
export default function VerificationBadge({ user, className = '' }) {
  if (user.verified) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary ${className}`}>
        <BadgeCheckIcon className="size-3.5" />
        Verified student
      </span>
    )
  }
  if (user.emailVerified) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-ink-muted ${className}`}>
        <MailIcon className="size-3.5" />
        Email verified
      </span>
    )
  }
  return null
}
