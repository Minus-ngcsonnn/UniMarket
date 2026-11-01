/**
 * Builds the Tailwind classes for a button. Shared by <Button> and by links that must
 * look like buttons, e.g. <Link className={buttonClasses({ variant: 'primary' })}>.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-[color,background-color,border-color,transform,box-shadow] duration-150 enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS = {
  primary: 'bg-primary text-white shadow-sm shadow-primary/20 enabled:hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-ink enabled:hover:border-primary enabled:hover:text-primary',
  selected: 'border border-primary bg-primary-soft text-primary', // pressed/toggled state of a secondary button
  ghost: 'text-ink enabled:hover:bg-primary-soft enabled:hover:text-primary',
  danger: 'bg-danger text-white enabled:hover:bg-danger/90',
}

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false, className = '' } = {}) {
  return [BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className].filter(Boolean).join(' ')
}
