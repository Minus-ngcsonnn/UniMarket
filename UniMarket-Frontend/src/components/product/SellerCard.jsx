import { Link } from 'react-router'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { accountService } from '../../services/account/accountService'
import { BadgeCheckIcon, MessageCircleIcon } from '../icons'
import RatingStars from '../reviews/RatingStars'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import useTranslation from '../../i18n/useTranslation'


/** Rating included in the real product page (seller.ratingAverage / ratingCount). */
function IncludedRating({ seller }) {
  const { t } = useTranslation()
  if (!seller.ratingCount) return <p className="text-xs text-ink-muted">{t("No reviews yet")}</p>
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
      <RatingStars value={seller.ratingAverage ?? 0} size="sm" />
      <span className="font-medium text-ink">{(seller.ratingAverage ?? 0).toFixed(1)}</span>({seller.ratingCount} {seller.ratingCount === 1 ? 'review' : 'reviews'})
    </p>
  )
}

/** Real API: "University · Campus", or "University (self-declared)" (V003). Never a student-verification claim. */
function affiliationText(t, seller) {
  if (!seller.university) return null
  if (seller.affiliationSource === 'SELF_DECLARED') return t('{name} (self-declared)', { name: seller.university })
  return seller.campusName ? `${seller.university} · ${seller.campusName}` : seller.university
}

/** "4.7 (3 reviews)" from the seller's reviews; nothing while loading or if it can't be loaded. */
function SellerRating({ sellerId }) {
  const { t } = useTranslation()
  const { data: rating } = useAsyncData(() => accountService.getRatingSummary(sellerId), `rating-${sellerId}`)
  if (!rating) return null
  if (rating.count === 0) return <p className="text-xs text-ink-muted">{t("No reviews yet")}</p>
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
      <RatingStars value={rating.average} size="sm" />
      <span className="font-medium text-ink">{rating.average.toFixed(1)}</span>({rating.count} {rating.count === 1 ? 'review' : 'reviews'})
    </p>
  )
}

/**
 * Seller summary on Product Detail (same avatar + verified badge style as the Figma cart/admin screens),
 * with the seller's rating and a link to their profile.
 * @param {() => void} [onMessage] "Message seller" action
 */
export default function SellerCard({ seller, onMessage }) {
  const { t, lang } = useTranslation()
  if (!seller) return null

  return (
    <section aria-labelledby="seller-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h2 id="seller-title" className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {t("Seller")}
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={seller.name} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <Link to={PATHS.user(seller.id)} className="hover:text-primary hover:underline">
              {seller.name}
            </Link>
            {seller.emailVerified && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <BadgeCheckIcon className="size-4" />
                <span className="sr-only sm:not-sr-only">{t("Email verified")}</span>
              </span>
            )}
          </p>
          {seller.ratingCount !== undefined ? <IncludedRating seller={seller} /> : <SellerRating sellerId={seller.id} />}
          {seller.programme && <p className="truncate text-sm text-ink-muted">{seller.programme}</p>}
          <p className="text-xs text-ink-muted">
            {[
              seller.ratingCount !== undefined ? affiliationText(t, seller) : `${t(UNIVERSITY_NAME)} · ${t(CAMPUSES[seller.campus]?.label)}`,
              seller.memberSince &&
                t('Member since {date}', { date: new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'short', year: 'numeric' }).format(new Date(seller.memberSince)) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {onMessage && (
          <Button variant="secondary" fullWidth onClick={onMessage} className="text-primary">
            <MessageCircleIcon className="size-4" />
            {t("Message seller")}
          </Button>
        )}
        <Link to={PATHS.user(seller.id)} className="inline-flex h-10 w-full items-center justify-center rounded-control border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary">
          {t("View profile")}
        </Link>
      </div>
    </section>
  )
}
