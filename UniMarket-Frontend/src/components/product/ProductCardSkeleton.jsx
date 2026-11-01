import { HeartIcon, ImageIcon, MapPinIcon } from '../icons'

/**
 * Outline of a product card (same structure as the Figma product card).
 * - static (default): decorative placeholder where listings will appear (homepage empty state).
 * - animated: loading placeholder while products are being fetched.
 * It contains no product data.
 */
export default function ProductCardSkeleton({ animated = false }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-card border border-line bg-surface ${animated ? 'animate-pulse' : ''}`}>
      <div className="relative flex aspect-[3/2] items-center justify-center bg-subtle text-line">
        {!animated && <ImageIcon className="size-10" />}
        <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-surface text-line">
          {!animated && <HeartIcon className="size-4" />}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <span className="h-5 w-14 rounded bg-success-soft" />
          <span className="h-2.5 w-12 rounded-full bg-subtle" />
        </div>
        <span className="h-3.5 w-4/5 rounded-full bg-subtle" />
        <span className="mt-2 h-5 w-1/3 rounded-full bg-line/70" />
        <span className="flex items-center gap-1.5 text-line">
          <MapPinIcon className="size-3.5" />
          <span className="h-2.5 w-1/2 rounded-full bg-subtle" />
        </span>
      </div>
    </div>
  )
}
