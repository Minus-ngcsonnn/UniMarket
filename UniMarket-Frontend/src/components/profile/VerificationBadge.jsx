import { MailIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/**
 * "Email verified" badge: the account confirmed its email address with a one-time code (OTP).
 * It does not claim student enrolment — UniMarket has no student-verification status (team decision, Nov 2026).
 * Unverified accounts show nothing publicly.
 */
export default function VerificationBadge({ user, className = '' }) {
  const { t } = useTranslation()
  if (!user.emailVerified) {
    return null
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-ink-muted ${className}`}>
      <MailIcon className="size-3.5" />
      {t("Email verified")}
    </span>
  )
}
