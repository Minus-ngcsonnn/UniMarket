import { Link } from 'react-router'
import { CATEGORIES } from '../../constants/categories'
import { CAMPUSES, listingCode } from '../../constants/product'
import { PATHS } from '../../routes/paths'
import { formatDateTime, formatPrice, formatRelativeTime } from '../../utils/format'
import { BanIcon, CheckCircleIcon, TrashIcon } from '../icons'
import { ConditionBadge, ModerationBadge, ProductStatusBadge } from '../product/ProductBadges'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import ImageSlot from '../ui/ImageSlot'
import DetailDialog, { DetailList } from './DetailDialog'
import useTranslation from '../../i18n/useTranslation'

const categoryName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? '—'

/** Listing cell for admin tables (Figma): thumbnail, title and UM code. */
export function ListingCell({ listing }) {
  return (
    <div className="flex items-center gap-3">
      <span className="block size-11 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
        <ImageSlot src={listing.images?.[0]} alt="" />
      </span>
      <div className="min-w-0">
        <p className="max-w-[16rem] truncate font-medium text-ink">{listing.title}</p>
        <p className="text-xs text-ink-muted">
          {listingCode(listing.id)}
        </p>
      </div>
    </div>
  )
}

/**
 * Everything an admin needs to decide on a listing, with Approve / Block.
 * @param {(action, row) => void} open useAdminActions().open
 */
export function ListingDetailDialog({ listing, onClose, open }) {
  const { t } = useTranslation()
  return (
    <DetailDialog
      title={listing.title}
      subtitle={`${listingCode(listing.id)} · ${t('listed {time}', { time: formatRelativeTime(listing.createdAt).toLowerCase() })}`}
      status={
        <>
          <ModerationBadge moderation={listing.moderation} audience="admin" showApproved />
          <ProductStatusBadge status={listing.status} />
          <ConditionBadge condition={listing.condition} className="py-1 text-xs" />
        </>
      }
      onClose={onClose}
      actions={
        <>
          {listing.moderation === 'APPROVED' && (
            <Link to={PATHS.product(listing.id)} className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-medium text-primary hover:bg-primary-soft">
              {t("Open public page")}
            </Link>
          )}
          <Button variant="ghost" className="text-danger" onClick={() => open('removeListing', listing)}>
            <TrashIcon className="size-4" />
            {t("Remove")}
          </Button>
          {listing.moderation !== 'BLOCKED' && (
            <Button variant="secondary" className="text-danger" onClick={() => open('blockListing', listing)}>
              <BanIcon className="size-4" />
              {t("Block")}
            </Button>
          )}
          {listing.moderation !== 'APPROVED' && (
            <Button onClick={() => open('approveListing', listing)}>
              <CheckCircleIcon className="size-4" />
              {t("Approve")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex gap-4">
        <span className="block size-24 shrink-0 overflow-hidden rounded-card border border-line bg-subtle">
          <ImageSlot src={listing.images?.[0]} alt={listing.title} />
        </span>
        <p className="line-clamp-5 text-sm leading-relaxed text-ink-muted">{listing.description}</p>
      </div>
      {listing.moderation === 'BLOCKED' && listing.moderationNote && (
        <Alert variant="danger" title={t("Blocked")}>
          {listing.moderationNote}
        </Alert>
      )}
      {listing.openReports > 0 && (
        <Alert variant="warning" title={`${listing.openReports} open report${listing.openReports > 1 ? 's' : ''}`}>
          <Link to={`${PATHS.adminReports}?status=OPEN&q=${encodeURIComponent(listing.title)}`} className="font-semibold text-primary hover:underline">
            {t("See reports")}
          </Link>
        </Alert>
      )}
      <DetailList
        items={[
          [
            'Seller',
            listing.seller ? (
              <Link to={PATHS.user(listing.seller.id)} className="text-primary hover:underline">
                {listing.seller.name}
              </Link>
            ) : (
              '—'
            ),
          ],
          ['Price', `${formatPrice(listing.price)}${listing.originalPrice ? ` (new ${formatPrice(listing.originalPrice)})` : ''}`],
          ['Category', t(categoryName(listing.categorySlug))],
          ['Campus', t(CAMPUSES[listing.campus]?.label)],
          ['Photos', listing.images?.length],
          ['Listed', formatDateTime(listing.createdAt)],
        ]}
      />
    </DetailDialog>
  )
}
