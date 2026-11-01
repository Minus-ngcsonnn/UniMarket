import { useSearchParams } from 'react-router'
import { CATEGORIES } from '../constants/categories'
import { CAMPUS_KEYS, CONDITION_KEYS, DEFAULT_SORT, SORT_OPTIONS } from '../constants/product'

const toList = (value, allowed) => (value ? value.split(',').filter((item) => allowed.includes(item)) : [])
const toPrice = (value) => {
  const number = Number(value)
  return value && Number.isFinite(number) && number >= 0 ? Math.round(number) : null
}

/** Reads catalog filters from the URL, ignoring unknown or invalid values. */
function parse(searchParams) {
  const category = searchParams.get('category') ?? ''
  const sort = searchParams.get('sort') ?? ''
  return {
    q: (searchParams.get('q') ?? '').trim(),
    category: CATEGORIES.some((c) => c.slug === category) ? category : '',
    conditions: toList(searchParams.get('condition'), CONDITION_KEYS),
    campuses: toList(searchParams.get('campus'), CAMPUS_KEYS),
    minPrice: toPrice(searchParams.get('minPrice')),
    maxPrice: toPrice(searchParams.get('maxPrice')),
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : DEFAULT_SORT,
    page: Math.max(1, Number.parseInt(searchParams.get('page'), 10) || 1),
  }
}

/** Writes filters to URL parameters, leaving out defaults so URLs stay short and shareable. */
function serialize(filters) {
  const params = {}
  if (filters.q) params.q = filters.q
  if (filters.category) params.category = filters.category
  if (filters.conditions.length) params.condition = filters.conditions.join(',')
  if (filters.campuses.length) params.campus = filters.campuses.join(',')
  if (filters.minPrice != null) params.minPrice = String(filters.minPrice)
  if (filters.maxPrice != null) params.maxPrice = String(filters.maxPrice)
  if (filters.sort !== DEFAULT_SORT) params.sort = filters.sort
  if (filters.page > 1) params.page = String(filters.page)
  return params
}

/**
 * Catalog filter state stored in the URL (?q=&category=&condition=&campus=&minPrice=&maxPrice=&sort=&page=),
 * so filtered views can be shared, bookmarked and navigated with Back/Forward.
 */
export default function useCatalogParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parse(searchParams)

  /** Applies changes; any filter change returns to page 1 unless a page is given. */
  function update(changes) {
    setSearchParams(serialize({ ...filters, page: 1, ...changes }))
  }

  function clearAll() {
    setSearchParams({})
  }

  return { filters, update, clearAll }
}
