import { useId } from 'react'
import FieldError from './FieldError'

const FIELD_SIZES = {
  md: 'h-10',
  lg: 'h-12', // auth forms in Figma
}

/**
 * Labelled text input with optional icon, hint and validation message.
 * Accessibility: the label is linked by id; the hint/error are linked with aria-describedby
 * and the field is marked aria-invalid when there is an error.
 *
 * @param {string} label visible label (required for accessibility)
 * @param {string} [error] validation message; also switches the field to the error style
 * @param {string} [hint] helper text shown when there is no error
 * @param {'md'|'lg'} [fieldSize] field height
 * @param {React.ReactNode} [startIcon] decorative icon inside the left edge
 * @param {React.ReactNode} [endAdornment] element placed inside the right edge (e.g. a toggle button)
 */
export default function Input({
  label,
  id,
  error,
  hint,
  required = false,
  fieldSize = 'md',
  startIcon,
  endAdornment,
  className = '',
  inputClassName = '',
  'aria-describedby': extraDescribedBy,
  ...props
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = hint && !error ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [extraDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined

  const stateClasses = error
    ? 'border-danger focus:border-danger focus:ring-danger/20'
    : 'border-line focus:border-primary focus:ring-primary/20'

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}*
          </span>
        )}
      </label>

      <div className="relative">
        {startIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-muted">
            {startIcon}
          </span>
        )}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-control border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-ink-muted/80 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-canvas ${FIELD_SIZES[fieldSize]} ${stateClasses} ${startIcon ? 'pl-11' : ''} ${endAdornment ? 'pr-11' : ''} ${inputClassName}`}
          {...props}
        />
        {endAdornment && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{endAdornment}</div>}
      </div>

      {hintId && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
