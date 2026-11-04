import { useId } from 'react'
import { CONDITIONS, CONDITION_KEYS } from '../../constants/product'
import useCatalogReference from '../../hooks/useCatalogReference'
import { PanelLeftCloseIcon, SlidersIcon } from '../icons'
import Select from '../ui/Select'
import FilterSection from './FilterSection'
import PriceRangeFilter from './PriceRangeFilter'
import useTranslation from '../../i18n/useTranslation'

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/** One campus at a time: the backend filters a single campusId. */
const toggleSingle = (list, value) => (list.includes(value) ? [] : [value])

/** Campuses grouped by university, in API order. */
function byUniversity(campuses) {
  const groups = new Map()
  campuses.forEach((campus) => {
    const key = campus.university ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(campus)
  })
  return [...groups.entries()]
}

function Count({ value }) {
  return <span className="text-xs text-ink-muted tabular-nums">{value ?? '–'}</span>
}

function CheckboxRow({ label, checked, count, onChange }) {
  const { t } = useTranslation()
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md py-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 shrink-0 cursor-pointer accent-primary" />
      <span className={`flex-1 ${checked ? 'font-medium text-primary' : 'text-ink'}`}>{t(label)}</span>
      <Count value={count} />
    </label>
  )
}

/**
 * Catalog filter panel (Figma sidebar): Categories, Price range, Item condition, University campus and (real API, V003)
 * pickup area by province / area. Categories, campuses and areas come from the API (useCatalogReference).
 * Every change is applied immediately through onChange(partialFilters); the backend filters the whole catalog.
 *
 * @param {object} filters current filters from useCatalogParams
 * @param {object} [facets] counts per category/condition/campus from the product service
 * @param {() => void} [onCollapse] shows the "hide filters" button (desktop sidebar)
 * @param {boolean} [bare] without the card frame (inside the mobile drawer)
 */
export default function ProductFilters({ filters, facets, onChange, onCollapse, bare = false }) {
  const { t } = useTranslation()
  const headingId = useId()
  const { reference } = useCatalogReference()
  const zonesInProvince = reference.zones.filter((zone) => !filters.province || zone.province === filters.province)

  return (
    <div aria-labelledby={headingId} role="group" className={bare ? '' : 'rounded-2xl border border-line bg-surface p-5'}>
      <div className="flex items-center justify-between pb-5">
        <h2 id={headingId} className="flex items-center gap-2.5 text-lg font-semibold text-ink">
          <SlidersIcon className="size-5" />
          {t("Filters")}
        </h2>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={t('Hide filters')}
            title={t('Hide filters')}
            className="flex size-8 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <PanelLeftCloseIcon className="size-4.5" />
          </button>
        )}
      </div>

      <FilterSection title={t("Categories")}>
        <ul className="flex flex-col gap-0.5">
          {[{ slug: '', name: 'All categories' }, ...reference.categories].map(({ slug, name }) => {
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
                  {t(name)}
                  <span className={`text-xs tabular-nums ${isSelected ? 'text-primary' : 'text-ink-muted'}`}>{count ?? '–'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </FilterSection>

      <FilterSection title={t("Price range")}>
        <PriceRangeFilter
          key={`${filters.minPrice}-${filters.maxPrice}`}
          min={filters.minPrice}
          max={filters.maxPrice}
          onCommit={(minPrice, maxPrice) => onChange({ minPrice, maxPrice })}
        />
      </FilterSection>

      <FilterSection title={t("Item condition")}>
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

      {reference.campuses.length > 0 && (
        <FilterSection title={t("University campus")}>
          {byUniversity(reference.campuses).map(([university, campuses]) => (
            <div key={university || 'campuses'} className="mb-2 last:mb-0">
              {university && <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t(university)}</p>}
              {campuses.map((campus) => (
                <CheckboxRow
                  key={campus.key}
                  label={campus.label}
                  checked={filters.campuses.includes(campus.key)}
                  count={facets?.campuses?.[campus.key]}
                  onChange={() => onChange({ campuses: toggleSingle(filters.campuses, campus.key) })}
                />
              ))}
            </div>
          ))}
        </FilterSection>
      )}

      {reference.zones.length > 0 && (
        <FilterSection title={t('Pickup area')}>
          <div className="flex flex-col gap-3">
            <Select
              label={t('Province / city')}
              name="province"
              options={[{ value: '', label: t('All provinces') }, ...reference.provinces.map((province) => ({ value: province, label: province }))]}
              value={filters.province}
              onChange={(province) => {
                const zone = reference.zones.find((z) => String(z.id) === filters.zone)
                onChange({ province, zone: zone && province && zone.province !== province ? '' : filters.zone })
              }}
            />
            <Select
              label={t('Area')}
              name="zone"
              options={[{ value: '', label: t('All areas') }, ...zonesInProvince.map((zone) => ({ value: String(zone.id), label: filters.province ? zone.name : `${zone.name} — ${zone.province}` }))]}
              value={filters.zone}
              onChange={(zone) => onChange({ zone })}
            />
            <p className="text-xs text-ink-muted">{t('Approximate area where the seller hands over the item.')}</p>
          </div>
        </FilterSection>
      )}
    </div>
  )
}
