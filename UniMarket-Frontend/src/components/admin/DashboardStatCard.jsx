/** Small trend line (Figma overview cards). Decorative: the number next to it is the information. */
function Sparkline({ values, className = '' }) {
  if (!values?.length) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - min) / range) * 24}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`h-9 w-16 shrink-0 2xl:w-20 ${className}`} aria-hidden="true">
      <polyline points={points} className="fill-none stroke-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Overview statistic card (Figma): label with icon on the right, large value with a trend line, note.
 * @param {boolean} [isSample] shows a "Sample" tag so demo numbers are never read as real figures
 */
export default function DashboardStatCard({ label, value, note, trend, Icon, isSample = false }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          {label}
          {isSample && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink uppercase">Sample</span>}
        </h3>
        {Icon && <Icon className="size-5 shrink-0 text-primary" />}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="min-w-0 text-2xl leading-tight font-semibold tracking-tight whitespace-nowrap text-ink tabular-nums 2xl:text-[1.75rem]">{value}</p>
        <Sparkline values={trend} />
      </div>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </article>
  )
}
