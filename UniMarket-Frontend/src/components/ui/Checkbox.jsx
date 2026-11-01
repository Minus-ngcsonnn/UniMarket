import { useId } from 'react'
import FieldError from './FieldError'

/**
 * Checkbox with a clickable label and optional validation message.
 * @param {React.ReactNode} label may contain links (e.g. Terms of service)
 */
export default function Checkbox({ label, id, error, className = '', ...props }) {
  const generatedId = useId()
  const checkboxId = id ?? generatedId
  const errorId = error ? `${checkboxId}-error` : undefined

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-start gap-2.5">
        <input
          id={checkboxId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
          {...props}
        />
        <label htmlFor={checkboxId} className="cursor-pointer text-sm text-ink-muted">
          {label}
        </label>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
