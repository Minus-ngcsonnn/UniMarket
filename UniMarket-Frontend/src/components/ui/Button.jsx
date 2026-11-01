import { buttonClasses } from './buttonClasses'
import Spinner from './Spinner'

/**
 * Standard UniMarket button.
 * @param {'primary'|'secondary'|'ghost'|'danger'} [variant]
 * @param {'sm'|'md'|'lg'} [size]
 * @param {boolean} [loading] shows a spinner and disables the button
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
