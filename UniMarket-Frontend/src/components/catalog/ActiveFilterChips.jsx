import { CONDITIONS } from '../../constants/product'
import useCatalogReference from '../../hooks/useCatalogReference'
import { findCampus, findCategory, findZone } from '../../services/products/catalogReference'
import { formatPrice } from '../../utils/format'
import { XIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/** Builds removable chips for every active filter. */
function chipsFor(filters, t, reference) {
  const chips = []
  if (filters.q) chips.push({ key: 'q', label: t('Search: “{query}”', { query: filters.q }), remove: { q: '' } })
  if (filters.category) {
    const name = findCategory(reference, filters.category)?.name ?? filters.category
    chips.push({ key: 'category', label: t('Category: {name}', { name: t(name) }), remove: { category: '' } })
  }
  if (filters.minPrice != null || filters.maxPrice != null) {
    const from = filters.minPrice != null ? formatPrice(filters.minPrice) : formatPrice(0)
    const to = filters.maxPrice != null ? formatPrice(filters.maxPrice) : t('any')
    chips.push({ key: 'price', label: t('Price: {from} – {to}', { from, to }), remove: { minPrice: null, maxPrice: null } })
  }
  filters.conditions.forEach((key) =>
    chips.push({ key: `condition-${key}`, label: t('Condition: {name}', { name: t(CONDITIONS[key].label) }), remove: { conditions: filters.conditions.filter((c) => c !== key) } }),
  )
  filters.campuses.forEach((key) =>
    chips.push({
      key: `campus-${key}`,
      label: t('Campus: {name}', { name: t(findCampus(reference, key)?.label ?? key) }),
      remove: { campuses: filters.campuses.filter((c) => c !== key) },
    }),
  )
  if (filters.province) chips.push({ key: 'province', label: t('Province: {name}', { name: filters.province }), remove: { province: '', zone: '' } })
  if (filters.zone) {
    const zone = findZone(reference, filters.zone)
    chips.push({ key: 'zone', label: t('Area: {name}', { name: zone ? zone.name : `#${filters.zone}` }), remove: { zone: '' } })
  }
  return chips
}

/** Active filter chips with "Clear all" (Figma: "Campus: Hanoi ×   Clear all"). */
export default function ActiveFilterChips({ filters, onChange, onClearAll }) {
  const { t } = useTranslation()
  const { reference } = useCatalogReference()
  const chips = chipsFor(filters, t, reference)
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul className="contents" aria-label={t('Active filters')}>
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              onClick={() => onChange(chip.remove)}
              aria-label={t('Remove filter {name}', { name: chip.label })}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {chip.label}
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClearAll} className="min-h-6 px-1 py-1 text-xs font-semibold text-primary hover:underline">
        {t("Clear all")}
      </button>
    </div>
  )
}
