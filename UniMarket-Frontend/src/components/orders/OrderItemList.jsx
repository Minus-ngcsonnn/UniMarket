import { Link } from 'react-router'
import { PATHS } from '../../routes/paths'
import { formatPrice } from '../../utils/format'
import { ConditionBadge } from '../product/ProductBadges'
import ImageSlot from '../ui/ImageSlot'

/**
 * The listings in one order (Q3: an order holds one seller's items).
 * @param {'compact'|'full'} [size] compact for order cards, full for order detail
 */
export default function OrderItemList({ items, size = 'compact' }) {
  const thumb = size === 'full' ? 'size-20' : 'size-14'
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item) => (
        <li key={item.productId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Link to={PATHS.product(item.productId)} className={`block shrink-0 overflow-hidden rounded-lg border border-line bg-subtle ${thumb}`}>
            <ImageSlot src={item.image} alt="" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link to={PATHS.product(item.productId)} className="line-clamp-2 text-sm font-medium text-ink hover:text-primary">
              {item.title}
            </Link>
            {item.condition && <ConditionBadge condition={item.condition} className="w-fit" />}
          </div>
          <p className="text-sm font-semibold whitespace-nowrap text-ink">{formatPrice(item.price)}</p>
        </li>
      ))}
    </ul>
  )
}
