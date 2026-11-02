import useTranslation from '../../i18n/useTranslation'
import { AlertCircleIcon } from '../icons'

/**
 * Validation message shown under a form field. Renders nothing when there is no message.
 * Validators return English text; it is translated here, so every form follows the interface language.
 */
export default function FieldError({ id, children }) {
  const { t } = useTranslation()
  if (!children) return null

  return (
    <p id={id} className="flex items-start gap-1 text-xs text-danger">
      <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
      <span>{typeof children === 'string' ? t(children) : children}</span>
    </p>
  )
}
