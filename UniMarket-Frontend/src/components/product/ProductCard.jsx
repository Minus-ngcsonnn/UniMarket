import { Link } from 'react-router'
import { CAMPUSES } from '../../constants/product'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { formatPrice, formatTimeAgo, savingsPercent } from '../../utils/format'
import { MapPinIcon } from '../icons'
import ImageSlot from '../ui/ImageSlot'
import { ConditionBadge, ProductStatusBadge } from './ProductBadges'
import SaveItemButton from './SaveItemButton'

/**
 * Product card ("Warm Minimal" redesign). Practical second-hand listing information, in this order:
 * photo, title, price (with the seller's original price when given), condition, seller · campus,
 * listing time; save heart on the photo. The whole card links to Product Detail.
 * A discount tag is shown only when the listing has an original price above its price.
 *
 * @param {object} product { id, title, price, originalPrice, condition, status, campus, images, createdAt, seller? }
 * @param {boolean} [preview] render without link/save button (live preview in the listing form)
 */
export default function ProductCard({ product, preview = false }) {
  const { t, lang } = useTranslation()
  const { id, title, price, originalPrice, condition, status, campus, images = [], createdAt, seller } = product
  const campusLabel = CAMPUSES[campus]?.label
  const savings = savingsPercent(price, originalPrice)
  const isUnavailable = status && status !== 'AVAILABLE'

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-200 hover:border-ink/15 hover:shadow-pop">
      <div className="relative aspect-[4/3] overflow-hidden bg-subtle">
        <ImageSlot src={images[0]} alt="" className={`transition-transform duration-300 group-hover:scale-[1.02] ${isUnavailable ? 'opacity-70' : ''}`} />

        {isUnavailable ? (
          <ProductStatusBadge status={status} className="absolute top-2.5 left-2.5" />
        ) : (
          savings > 0 && (
            <span className="absolute top-2.5 left-2.5 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">
              <span aria-hidden="true">{t('product.off', { percent: savings })}</span>
              <span className="sr-only">{t('product.offLabel', { percent: savings })}</span>
            </span>
          )
        )}

        {!preview && <SaveItemButton productId={id} title={title} className="absolute top-2.5 right-2.5 z-10" />}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium text-ink sm:text-[15px]">
          {preview ? (
            title
          ) : (
            // Stretched link: the whole card is clickable, while the save button stays separate.
            <Link to={PATHS.product(id)} className="after:absolute after:inset-0 focus-visible:outline-none">
              {title}
            </Link>
          )}
        </h3>

        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-bold tracking-tight text-ink sm:text-lg">{price != null ? formatPrice(price) : '—'}</span>
          {savings > 0 && (
            <s className="text-xs text-ink-muted">
              <span className="sr-only">{t('product.originalPrice')}: </span>
              {formatPrice(originalPrice)}
            </s>
          )}
        </p>

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <ConditionBadge condition={condition} className="w-fit" />
          <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
            {(seller || campusLabel) && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPinIcon className="size-3.5 shrink-0" />
                <span className="truncate">{[seller?.name, campusLabel].filter(Boolean).join(' · ')}</span>
              </span>
            )}
            {createdAt && (
              <time dateTime={createdAt} className="shrink-0">
                {formatTimeAgo(createdAt, lang)}
              </time>
            )}
          </div>
        </div>
      </div>

      {/* Keyboard focus ring for the stretched link */}
      {!preview && <span className="pointer-events-none absolute inset-0 rounded-card ring-primary group-has-[a:focus-visible]:ring-2" aria-hidden="true" />}
    </article>
  )
}
