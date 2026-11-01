import { Link } from 'react-router'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { accountService } from '../../services/account/accountService'
import { BadgeCheckIcon, MessageCircleIcon } from '../icons'
import RatingStars from '../reviews/RatingStars'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'

const memberSinceFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })

/** "4.7 (3 reviews)" from the seller's reviews; nothing while loading or if it can't be loaded. */
function SellerRating({ sellerId }) {
  const { data: rating } = useAsyncData(() => accountService.getRatingSummary(sellerId), `rating-${sellerId}`)
  if (!rating) return null
  if (rating.count === 0) return <p className="text-xs text-ink-muted">No reviews yet</p>
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
  if (!seller) return null

  return (
    <section aria-labelledby="seller-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h2 id="seller-title" className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Seller
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={seller.name} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <Link to={PATHS.user(seller.id)} className="hover:text-primary hover:underline">
              {seller.name}
            </Link>
            {seller.verified && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <BadgeCheckIcon className="size-4" />
                <span className="sr-only sm:not-sr-only">Verified student</span>
              </span>
            )}
          </p>
          <SellerRating sellerId={seller.id} />
          <p className="truncate text-sm text-ink-muted">{seller.programme}</p>
          <p className="text-xs text-ink-muted">
            {UNIVERSITY_NAME} · {CAMPUSES[seller.campus]?.label} · Member since {memberSinceFormatter.format(new Date(seller.memberSince))}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {onMessage && (
          <Button variant="secondary" fullWidth onClick={onMessage} className="text-primary">
            <MessageCircleIcon className="size-4" />
            Message seller
          </Button>
        )}
        <Link to={PATHS.user(seller.id)} className="inline-flex h-10 w-full items-center justify-center rounded-control border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary">
          View profile
        </Link>
      </div>
    </section>
  )
}
