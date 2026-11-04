import { USE_MOCK_PRODUCTS } from '../../config/dataSource'
import { PackageIcon } from '../../components/icons'
import { CATEGORIES, frontendCategorySlug } from '../../constants/categories'
import { CAMPUSES, CAMPUS_KEYS, UNIVERSITY_NAME } from '../../constants/product'
import apiClient from '../apiClient'

/**
 * Reference data for the catalog, filters and the listing form, in one shape for both data sources:
 *
 * {
 *   source: 'api' | 'sample',
 *   categories: [{ slug, name, id, Icon, tagline }],      // slug = frontend slug (see constants/categories.js)
 *   campuses:   [{ key, label, id, universityId, university }], // key = what the URL / filters store
 *   zones:      [{ id, code, name, province }],         // V003 demo pickup areas (empty with sample data)
 *   provinces:  [string],
 * }
 *
 * Real API: GET /api/categories, GET /api/campuses, GET /api/locations/zones, loaded once per page load and shared.
 * A failed load is not cached, so the next caller tries again.
 */

const SAMPLE_REFERENCE = {
  source: 'sample',
  categories: CATEGORIES.map((c) => ({ ...c, id: c.slug })),
  campuses: CAMPUS_KEYS.map((key) => ({ key, label: CAMPUSES[key].label, id: key, universityId: null, university: UNIVERSITY_NAME })),
  zones: [],
  provinces: [],
}

function buildReference(categories, campuses, zones) {
  return {
    source: 'api',
    categories: categories.map((category) => {
      const slug = frontendCategorySlug(category.slug)
      const design = CATEGORIES.find((c) => c.slug === slug)
      return {
        slug,
        // Known categories keep their translated design name; new ones show the database name.
        name: design?.name ?? category.name,
        tagline: design?.tagline ?? null,
        Icon: design?.Icon ?? PackageIcon,
        id: category.id,
        availableCount: category.availableCount ?? null,
      }
    }),
    campuses: campuses.map((campus) => ({
      key: String(campus.id),
      label: campus.name,
      id: campus.id,
      universityId: campus.universityId,
      university: campus.university,
    })),
    zones,
    provinces: [...new Set(zones.map((zone) => zone.province))].sort((a, b) => a.localeCompare(b, 'vi')),
  }
}

let pending = null

/** @returns {Promise<object>} the reference data (see above) */
export function loadCatalogReference() {
  if (USE_MOCK_PRODUCTS) return Promise.resolve(SAMPLE_REFERENCE)
  pending ??= Promise.all([apiClient.get('/categories'), apiClient.get('/campuses'), apiClient.get('/locations/zones')])
    .then(([categories, campuses, zones]) => buildReference(categories.data, campuses.data, zones.data))
    .catch((error) => {
      pending = null
      throw error
    })
  return pending
}

/** The reference data while it loads: categories from the design so links and labels work immediately. */
export const INITIAL_REFERENCE = USE_MOCK_PRODUCTS ? SAMPLE_REFERENCE : { ...SAMPLE_REFERENCE, source: 'loading', campuses: [] }

/** Category by frontend slug, backend slug or id. */
export function findCategory(reference, slugOrId) {
  if (slugOrId == null || slugOrId === '') return undefined
  const slug = frontendCategorySlug(String(slugOrId))
  return reference?.categories.find((c) => c.slug === slug || String(c.id) === String(slugOrId))
}

/** Campus by filter key. */
export function findCampus(reference, key) {
  return reference?.campuses.find((c) => c.key === String(key))
}

/** Zone by id. */
export function findZone(reference, id) {
  return reference?.zones.find((z) => String(z.id) === String(id))
}
