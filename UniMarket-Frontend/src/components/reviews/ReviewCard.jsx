import { Link } from 'react-router'
import { PATHS } from '../../routes/paths'
import { formatRelativeTime } from '../../utils/format'
import Avatar from '../ui/Avatar'
import RatingStars from './RatingStars'
import useTranslation from '../../i18n/useTranslation'

/** The reviewer's side of the order: "Buyer" bought from the person reviewed, "Seller" sold to them. */
const ROLE_LABELS = { BUYER: 'Buyer', SELLER: 'Seller' }

/**
 * One review: who wrote it, their side of the order, stars, comment and date.
 * @param {boolean} [showReviewee] show who the review is about instead of who wrote it (own reviews)
 */
export default function ReviewCard({ review, showReviewee = false, className = '' }) {
  const { t } = useTranslation()
  const person = showReviewee ? review.reviewee : review.reviewer
  return (
    <article className={`flex gap-3 rounded-card border border-line bg-surface p-4 ${className}`}>
      <Avatar name={person?.name} size="sm" className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-ink">
            {showReviewee && <span className="font-normal text-ink-muted">{t("Your review of")} </span>}
            {person ? (
              <Link to={PATHS.user(person.id)} className="hover:text-primary hover:underline">
                {person.name}
              </Link>
            ) : (
              'Former student'
            )}
          </p>
          {!showReviewee && <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">{t(ROLE_LABELS[review.role])}</span>}
          {review.isSample && (
            <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-ink" title={t("Written in this demo and saved in this browser only")}>
              {t("Sample · this browser only")}
            </span>
          )}
          <time dateTime={review.createdAt} className="ml-auto text-xs text-ink-muted">
            {formatRelativeTime(review.createdAt)}
          </time>
        </div>
        <RatingStars value={review.rating} size="sm" />
        {review.comment ? (
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">{review.comment}</p>
        ) : (
          <p className="text-sm text-ink-muted/80 italic">{t("Rating only, no comment.")}</p>
        )}
      </div>
    </article>
  )
}
