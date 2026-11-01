import { useId } from 'react'
import { CATEGORIES } from '../../constants/categories'
import { CAMPUSES, CAMPUS_KEYS, CONDITIONS, CONDITION_KEYS, UNIVERSITY_NAME } from '../../constants/product'
import { PanelLeftCloseIcon, SlidersIcon } from '../icons'
import FilterSection from './FilterSection'
import PriceRangeFilter from './PriceRangeFilter'

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function Count({ value }) {
  return <span className="text-xs text-ink-muted tabular-nums">{value ?? '–'}</span>
}

function CheckboxRow({ label, checked, count, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md py-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 shrink-0 cursor-pointer accent-primary" />
      <span className={`flex-1 ${checked ? 'font-medium text-primary' : 'text-ink'}`}>{label}</span>
      <Count value={count} />
    </label>
  )
}

/**
 * Catalog filter panel (Figma sidebar): Categories, Price range, Item condition, University campus.
 * Every change is applied immediately through onChange(partialFilters).
 *
 * @param {object} filters current filters from useCatalogParams
 * @param {object} [facets] counts per category/condition/campus from the product service
 * @param {() => void} [onCollapse] shows the "hide filters" button (desktop sidebar)
 * @param {boolean} [bare] without the card frame (inside the mobile drawer)
 */
export default function ProductFilters({ filters, facets, onChange, onCollapse, bare = false }) {
  const headingId = useId()

  return (
    <div aria-labelledby={headingId} role="group" className={bare ? '' : 'rounded-2xl border border-line bg-surface p-5'}>
      <div className="flex items-center justify-between pb-5">
        <h2 id={headingId} className="flex items-center gap-2.5 text-lg font-semibold text-ink">
          <SlidersIcon className="size-5" />
          Filters
        </h2>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide filters"
            title="Hide filters"
            className="flex size-8 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <PanelLeftCloseIcon className="size-4.5" />
          </button>
        )}
      </div>

      <FilterSection title="Categories">
        <ul className="flex flex-col gap-0.5">
          {[{ slug: '', name: 'All categories' }, ...CATEGORIES].map(({ slug, name }) => {
            const isSelected = filters.category === slug
            const count = slug ? facets?.categories?.[slug] : facets?.total
            return (
              <li key={slug || 'all'}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChange({ category: slug })}
                  className={`flex w-full items-center justify-between rounded-control px-2.5 py-2 text-left text-sm transition-colors ${
                    isSelected ? 'bg-primary-soft font-medium text-primary' : 'text-ink hover:bg-subtle'
                  }`}
                >
                  {name}
                  <span className={`text-xs tabular-nums ${isSelected ? 'text-primary' : 'text-ink-muted'}`}>{count ?? '–'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </FilterSection>

      <FilterSection title="Price range">
        <PriceRangeFilter
          key={`${filters.minPrice}-${filters.maxPrice}`}
          min={filters.minPrice}
          max={filters.maxPrice}
          onCommit={(minPrice, maxPrice) => onChange({ minPrice, maxPrice })}
        />
      </FilterSection>

      <FilterSection title="Item condition">
        {CONDITION_KEYS.map((key) => (
          <CheckboxRow
            key={key}
            label={CONDITIONS[key].label}
            checked={filters.conditions.includes(key)}
            count={facets?.conditions?.[key]}
            onChange={() => onChange({ conditions: toggle(filters.conditions, key) })}
          />
        ))}
      </FilterSection>

      <FilterSection title="University campus">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{UNIVERSITY_NAME}</p>
        {CAMPUS_KEYS.map((key) => (
          <CheckboxRow
            key={key}
            label={CAMPUSES[key].label}
            checked={filters.campuses.includes(key)}
            count={facets?.campuses?.[key]}
            onChange={() => onChange({ campuses: toggle(filters.campuses, key) })}
          />
        ))}
      </FilterSection>
    </div>
  )
}
