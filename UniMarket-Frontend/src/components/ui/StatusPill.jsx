/** Colour sets shared by every status pill (Figma admin table style: "● Active", "● Pending"). */
const PILL_TONES = {
  success: { pill: 'bg-success-soft text-success', dot: 'bg-success' },
  warning: { pill: 'bg-warning-soft text-ink', dot: 'bg-warning' },
  danger: { pill: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  primary: { pill: 'bg-primary-soft text-primary', dot: 'bg-primary' },
  neutral: { pill: 'bg-subtle text-ink-muted', dot: 'bg-ink-muted' },
}

/**
 * Status pill with a coloured dot.
 * @param {'success'|'warning'|'danger'|'primary'|'neutral'} tone
 */
export default function StatusPill({ tone = 'neutral', children, className = '' }) {
  const { pill, dot } = PILL_TONES[tone] ?? PILL_TONES.neutral
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${pill} ${className}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  )
}
