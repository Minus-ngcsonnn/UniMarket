import useTranslation from '../../i18n/useTranslation'

/**
 * Row of filter tabs with optional counts (e.g. "All 9 · Pending 1 · Active 7").
 * Uses pressed buttons (aria-pressed), so it works as a simple filter control for screen readers.
 * @param {{ value: string, label: string, count?: number }[]} options
 */
export default function FilterTabs({ options, value, onChange, label, className = '' }) {
  const { t } = useTranslation()
  return (
    <div role="group" aria-label={t(label)} className={`flex gap-1 overflow-x-auto ${className}`}>
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-subtle hover:text-ink'
            }`}
          >
            {t(option.label)}
            {option.count != null && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${isActive ? 'bg-primary text-white' : 'bg-subtle text-ink-muted'}`}>
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
