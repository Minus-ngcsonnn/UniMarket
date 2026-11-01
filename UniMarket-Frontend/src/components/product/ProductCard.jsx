import { Link } from 'react-router'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import { PATHS } from '../../routes/paths'
import { formatPrice, formatRelativeTime } from '../../utils/format'
import { MapPinIcon } from '../icons'
import ImageSlot from '../ui/ImageSlot'
import { ConditionBadge, ProductStatusBadge } from './ProductBadges'
import SaveItemButton from './SaveItemButton'

/**
 * Product card from the Figma catalog: photo with save button, condition + time, title, price
 * (with crossed-out original price) and campus. The whole card links to Product Detail.
 *
 * @param {object} product { id, title, price, originalPrice, condition, status, campus, images, createdAt }
 * @param {boolean} [preview] render without link/save button (live preview in the listing form)
 */
export default function ProductCard({ product, preview = false }) {
  const { id, title, price, originalPrice, condition, status, campus, images = [], createdAt } = product
  const campusLabel = CAMPUSES[campus]?.label

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-ink/5">
      <div className="relative aspect-[3/2] overflow-hidden bg-subtle">
        <ImageSlot src={images[0]} alt="" className="transition-transform duration-300 group-hover:scale-[1.03]" />

        {status && status !== 'AVAILABLE' && <ProductStatusBadge status={status} className="absolute top-3 left-3 shadow-sm" />}

        {!preview && (
          <SaveItemButton productId={id} title={title} className="absolute top-3 right-3 z-10" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <ConditionBadge condition={condition} />
          {createdAt && <span className="truncate text-[11px] text-ink-muted">{formatRelativeTime(createdAt)}</span>}
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold text-ink sm:text-[15px]">
          {preview ? (
            title
          ) : (
            // Stretched link: the whole card is clickable, while the save button stays separate.
            <Link to={PATHS.product(id)} className="after:absolute after:inset-0 focus-visible:outline-none">
              {title}
            </Link>
          )}
        </h3>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          <span className="text-lg tracking-tight text-ink sm:text-2xl">{price != null ? formatPrice(price) : '—'}</span>
          {originalPrice > price && <s className="text-xs text-ink-muted">{formatPrice(originalPrice)}</s>}
        </div>

        {campusLabel && (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <MapPinIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              {UNIVERSITY_NAME} · {campusLabel}
            </span>
          </p>
        )}
      </div>

      {/* Keyboard focus ring for the stretched link */}
      {!preview && <span className="pointer-events-none absolute inset-0 rounded-card ring-primary group-has-[a:focus-visible]:ring-2" aria-hidden="true" />}
    </article>
  )
}
