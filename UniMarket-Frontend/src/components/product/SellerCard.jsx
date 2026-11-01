import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import { initials } from '../../utils/format'
import { BadgeCheckIcon, MessageCircleIcon } from '../icons'
import Button from '../ui/Button'

const memberSinceFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })

/**
 * Seller summary on Product Detail (same avatar + verified badge style as the Figma cart/admin screens).
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
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden="true">
          {initials(seller.name)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            {seller.name}
            {seller.verified && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <BadgeCheckIcon className="size-4" />
                <span className="sr-only sm:not-sr-only">Verified student</span>
              </span>
            )}
          </p>
          <p className="truncate text-sm text-ink-muted">{seller.programme}</p>
          <p className="text-xs text-ink-muted">
            {UNIVERSITY_NAME} · {CAMPUSES[seller.campus]?.label} · Member since {memberSinceFormatter.format(new Date(seller.memberSince))}
          </p>
        </div>
      </div>
      {onMessage && (
        <Button variant="secondary" fullWidth onClick={onMessage} className="mt-4 text-primary">
          <MessageCircleIcon className="size-4" />
          Message seller
        </Button>
      )}
    </section>
  )
}
