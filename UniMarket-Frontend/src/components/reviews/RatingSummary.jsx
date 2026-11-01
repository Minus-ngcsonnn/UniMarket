import RatingStars from './RatingStars'

/**
 * Average rating with the 1–5 star distribution (reputation on profiles).
 * @param {{ average: number|null, count: number, distribution: Record<number, number> }} rating
 */
export default function RatingSummary({ rating, className = '' }) {
  if (!rating) return null
  const { average, count, distribution } = rating

  return (
    <div className={`flex flex-col gap-5 sm:flex-row sm:items-center ${className}`}>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:w-36">
        <p className="text-4xl font-bold tracking-tight text-ink">{average != null ? average.toFixed(1) : '–'}</p>
        <RatingStars value={average ?? 0} />
        <p className="text-sm text-ink-muted">{count === 1 ? '1 review' : `${count} reviews`}</p>
      </div>
      <dl className="flex flex-1 flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const share = count ? (distribution[star] / count) * 100 : 0
          return (
            <div key={star} className="flex items-center gap-2 text-sm">
              <dt className="w-12 shrink-0 text-ink-muted">{star} star</dt>
              <dd className="flex flex-1 items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${share}%` }} />
                </span>
                <span className="w-6 text-right text-ink-muted tabular-nums">{distribution[star]}</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
