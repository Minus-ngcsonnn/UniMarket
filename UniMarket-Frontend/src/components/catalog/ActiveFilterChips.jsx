import { CATEGORIES } from '../../constants/categories'
import { CAMPUSES, CONDITIONS } from '../../constants/product'
import { formatPrice } from '../../utils/format'
import { XIcon } from '../icons'

/** Builds removable chips for every active filter. */
function chipsFor(filters) {
  const chips = []
  if (filters.q) chips.push({ key: 'q', label: `Search: “${filters.q}”`, remove: { q: '' } })
  if (filters.category) {
    const name = CATEGORIES.find((c) => c.slug === filters.category)?.name
    chips.push({ key: 'category', label: `Category: ${name}`, remove: { category: '' } })
  }
  if (filters.minPrice != null || filters.maxPrice != null) {
    const from = filters.minPrice != null ? formatPrice(filters.minPrice) : formatPrice(0)
    const to = filters.maxPrice != null ? formatPrice(filters.maxPrice) : 'any'
    chips.push({ key: 'price', label: `Price: ${from} – ${to}`, remove: { minPrice: null, maxPrice: null } })
  }
  filters.conditions.forEach((key) =>
    chips.push({ key: `condition-${key}`, label: `Condition: ${CONDITIONS[key].label}`, remove: { conditions: filters.conditions.filter((c) => c !== key) } }),
  )
  filters.campuses.forEach((key) =>
    chips.push({ key: `campus-${key}`, label: `Campus: ${CAMPUSES[key].label}`, remove: { campuses: filters.campuses.filter((c) => c !== key) } }),
  )
  return chips
}

/** Active filter chips with "Clear all" (Figma: "Campus: Hanoi ×   Clear all"). */
export default function ActiveFilterChips({ filters, onChange, onClearAll }) {
  const chips = chipsFor(filters)
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul className="contents" aria-label="Active filters">
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              onClick={() => onChange(chip.remove)}
              aria-label={`Remove filter ${chip.label}`}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {chip.label}
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClearAll} className="px-1 text-xs font-semibold text-primary hover:underline">
        Clear all
      </button>
    </div>
  )
}
