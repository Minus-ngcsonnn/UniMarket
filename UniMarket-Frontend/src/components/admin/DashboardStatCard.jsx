/** Small trend line (Figma overview cards). Decorative: the number next to it is the information. */
function Sparkline({ values, className = '' }) {
  if (!values?.length) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - min) / range) * 24}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`h-9 w-20 shrink-0 2xl:w-28 ${className}`} aria-hidden="true">
      <polyline points={`0,32 ${points} 100,32`} className="fill-primary/10 stroke-none" />
      <polyline points={points} className="fill-none stroke-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Overview statistic card: label, value, short note and a sparkline.
 * @param {boolean} [isSample] shows a "Sample" tag so demo numbers are never read as real figures
 */
export default function DashboardStatCard({ label, value, note, trend, Icon, isSample = false }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-muted">
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon className="size-4" />
            </span>
          )}
          {label}
        </h3>
        {isSample && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink uppercase">Sample</span>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-bold tracking-tight break-words text-ink tabular-nums 2xl:text-[1.75rem]">{value}</p>
          {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
        </div>
        <Sparkline values={trend} />
      </div>
    </article>
  )
}
