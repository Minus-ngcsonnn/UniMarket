import { StarIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

const SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' }

/**
 * Read-only star rating (supports halves, e.g. 4.5). Screen readers hear "4.5 out of 5 stars".
 * @param {number|null} value 0–5
 */
export default function RatingStars({ value, size = 'md', className = '' }) {
  const { t } = useTranslation()
  const rating = Math.max(0, Math.min(5, value ?? 0))
  return (
    <span role="img" aria-label={t('{rating} out of 5 stars', { rating })} className={`inline-flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, rating - (star - 1)))
        return (
          <span key={star} className={`relative inline-flex ${SIZES[size]}`}>
            <StarIcon className={`${SIZES[size]} text-line`} fill="currentColor" stroke="none" />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <StarIcon className={`${SIZES[size]} max-w-none text-amber-400`} fill="currentColor" stroke="none" />
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
