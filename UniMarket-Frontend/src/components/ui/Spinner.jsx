const SIZES = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
}

/** Decorative loading spinner. Wrap it in an element with role="status" when it is the only loading cue. */
export default function Spinner({ size = 'md', className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`animate-spin ${SIZES[size]} ${className}`}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
