import { useId } from 'react'
import FieldError from './FieldError'
import useTranslation from '../../i18n/useTranslation'

/**
 * Labelled multi-line text field with optional character counter, hint and validation message.
 * @param {number} [maxLength] also shows "used / max" under the field
 */
export default function Textarea({ label, id, error, hint, maxLength, value = '', rows = 5, className = '', ...props }) {
  const { t } = useTranslation()
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint && !error ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const counterId = maxLength ? `${fieldId}-counter` : undefined

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {typeof label === 'string' ? t(label) : label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId, counterId].filter(Boolean).join(' ') || undefined}
        className={`w-full resize-y rounded-control border bg-surface px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-muted/80 focus:ring-2 focus:outline-none ${
          error ? 'border-danger focus:ring-danger/20' : 'border-line focus:border-primary focus:ring-primary/20'
        }`}
        {...props}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          {hintId && (
            <p id={hintId} className="text-xs text-ink-muted">
              {typeof hint === 'string' ? t(hint) : hint}
            </p>
          )}
          <FieldError id={errorId}>{error}</FieldError>
        </div>
        {maxLength && (
          <p id={counterId} className="shrink-0 text-xs text-ink-muted tabular-nums">
            {value.length} / {maxLength}
          </p>
        )}
      </div>
    </div>
  )
}
