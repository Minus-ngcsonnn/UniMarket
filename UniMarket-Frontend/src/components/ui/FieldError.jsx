import { AlertCircleIcon } from '../icons'

/** Validation message shown under a form field. Renders nothing when there is no message. */
export default function FieldError({ id, children }) {
  if (!children) return null

  return (
    <p id={id} className="flex items-start gap-1 text-xs text-danger">
      <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
