import { useSearchParams } from 'react-router'
import { frontendCategorySlug } from '../constants/categorySlugs'
import { CONDITION_KEYS, DEFAULT_SORT, SORT_OPTIONS } from '../constants/product'

const toList = (value, isAllowed) => (value ? value.split(',').map((item) => item.trim()).filter(isAllowed) : [])
const toPrice = (value) => {
  const number = Number(value)
  return value && Number.isFinite(number) && number >= 0 ? Math.round(number) : null
}
const SLUG = /^[a-z0-9-]{1,60}$/
const CAMPUS_KEY = /^[A-Z_]{1,20}$|^\d{1,9}$/ // sample campus keys (HANOI) or campus ids (real API)

/**
 * Reads catalog filters from the URL, ignoring invalid values. Categories, campuses and areas are checked against the
 * real lists by the product service (an unknown value matches nothing instead of silently showing everything).
 */
function parse(searchParams) {
  const category = (searchParams.get('category') ?? '').trim()
  const sort = searchParams.get('sort') ?? ''
  const zone = searchParams.get('zone') ?? ''
  return {
    q: (searchParams.get('q') ?? '').trim().slice(0, 100),
    category: SLUG.test(category) ? frontendCategorySlug(category) : '',
    conditions: toList(searchParams.get('condition'), (item) => CONDITION_KEYS.includes(item)),
    campuses: toList(searchParams.get('campus'), (item) => CAMPUS_KEY.test(item)).slice(0, 1),
    province: (searchParams.get('province') ?? '').trim().slice(0, 100),
    zone: /^\d{1,9}$/.test(zone) ? zone : '',
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
  if (filters.province) params.province = filters.province
  if (filters.zone) params.zone = filters.zone
  if (filters.minPrice != null) params.minPrice = String(filters.minPrice)
  if (filters.maxPrice != null) params.maxPrice = String(filters.maxPrice)
  if (filters.sort !== DEFAULT_SORT) params.sort = filters.sort
  if (filters.page > 1) params.page = String(filters.page)
  return params
}

/**
 * Catalog filter state stored in the URL (?q=&category=&condition=&campus=&province=&zone=&minPrice=&maxPrice=&sort=&page=),
 * so filtered views can be shared, bookmarked and navigated with Back/Forward. One campus at a time (the backend
 * filters a single campusId); province and zone are the V003 pickup-area filters.
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

export { parse as parseCatalogParams, serialize as serializeCatalogParams }
