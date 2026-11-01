import { useId, useState } from 'react'
import { RATING_LABELS } from '../../constants/review'
import { StarIcon } from '../icons'
import FieldError from '../ui/FieldError'

/**
 * Star rating input: a native radio group styled as 5 stars, so arrow keys, Tab and screen readers work.
 * @param {number} value 0 = nothing chosen yet, otherwise 1–5
 * @param {(value: number) => void} onChange
 */
export default function RatingInput({ label = 'Your rating', name = 'rating', value, onChange, error }) {
  const id = useId()
  const [hovered, setHovered] = useState(0)
  const shown = hovered || value
  const errorId = error ? `${id}-error` : undefined

  return (
    <fieldset aria-describedby={errorId} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-ink">
        {label} <span className="text-danger" aria-hidden="true">*</span>
      </legend>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex" onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label key={star} className="cursor-pointer p-0.5" onMouseEnter={() => setHovered(star)}>
              <input
                type="radio"
                name={name}
                value={star}
                checked={value === star}
                onChange={() => onChange(star)}
                aria-invalid={error ? true : undefined}
                className="peer sr-only"
              />
              <span className="sr-only">{`${star} star${star > 1 ? 's' : ''}, ${RATING_LABELS[star]}`}</span>
              <StarIcon
                className={`size-8 rounded transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                  star <= shown ? 'text-amber-400' : 'text-line hover:text-amber-200'
                }`}
                fill="currentColor"
                stroke="none"
              />
            </label>
          ))}
        </div>
        <span className="text-sm font-medium text-ink-muted" aria-hidden="true">
          {shown ? RATING_LABELS[shown] : 'Choose 1 to 5 stars'}
        </span>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  )
}
