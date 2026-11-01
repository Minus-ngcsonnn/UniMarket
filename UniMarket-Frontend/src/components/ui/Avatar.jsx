import { initials } from '../../utils/format'

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-xl',
  xl: 'size-20 text-2xl',
}

/** Initials avatar (there are no profile photos in this version). Decorative: the name is shown next to it. */
export default function Avatar({ name, size = 'md', className = '' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary ${SIZES[size]} ${className}`}
      aria-hidden="true"
    >
      {initials(name ?? '?')}
    </span>
  )
}
