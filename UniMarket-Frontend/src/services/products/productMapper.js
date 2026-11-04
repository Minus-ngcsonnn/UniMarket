import { frontendCategorySlug } from '../../constants/categorySlugs'

/**
 * Backend listing JSON (docs/PRODUCTS_API.md) → the product shape the pages and cards use (same as the sample data in
 * src/mocks/products.js), plus a few fields only the real API has. Never invents values: missing data stays null.
 *
 * {
 *   id, title, description, price, originalPrice, condition, status, purchasable, featured, createdAt, updatedAt,
 *   moderation,            // PENDING | APPROVED | BLOCKED; public views have none → APPROVED (they are approved)
 *   editable,              // owner views only: can still be edited / removed (DRAFT or AVAILABLE)
 *   categorySlug, categoryId, categoryName,
 *   campus,                // campus key for filters = String(campus.id), or null (V003: located by pickup area only)
 *   campusInfo, pickupZone, locationLabel,
 *   images,                // URLs, main photo first
 *   imageItems,            // [{ id, url }] for editing photos
 *   sellerId, seller: { id, name, emailVerified, memberSince, university, campusName, affiliationSource,
 *                        ratingAverage, ratingCount, contact }
 * }
 */

/** "Campus name" or "Area, Province" (V003 approximate pickup area). */
export function locationLabelOf(campus, pickupZone) {
  if (campus?.name) return campus.name
  if (pickupZone?.name) return pickupZone.province ? `${pickupZone.name}, ${pickupZone.province}` : pickupZone.name
  return null
}

function toSeller(seller) {
  if (!seller) return undefined
  return {
    id: seller.id,
    name: seller.fullName,
    emailVerified: Boolean(seller.emailVerified),
    memberSince: seller.memberSince ?? null,
    university: seller.university ?? seller.campus?.university ?? null,
    campusName: seller.campus?.name ?? null,
    affiliationSource: seller.affiliationSource ?? null,
    ratingAverage: seller.ratingAverage != null ? Number(seller.ratingAverage) : null,
    ratingCount: seller.ratingCount ?? null,
    contact: seller.contact ?? null,
  }
}

/** @param {object} item ProductSummaryResponse or ProductDetailResponse */
export function toProduct(item) {
  if (!item) return null
  const images = Array.isArray(item.images)
    ? [...item.images].sort((a, b) => a.sortOrder - b.sortOrder)
    : item.mainImageUrl
      ? [{ id: null, url: item.mainImageUrl }]
      : []
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    price: item.price,
    originalPrice: item.originalPrice ?? null,
    condition: item.condition,
    status: item.status,
    purchasable: Boolean(item.purchasable),
    featured: Boolean(item.featured),
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    moderation: item.moderation ?? 'APPROVED',
    isOwnerView: item.moderation != null,
    editable: item.editable ?? null,
    categorySlug: item.category ? frontendCategorySlug(item.category.slug) : null,
    categoryId: item.category?.id ?? null,
    categoryName: item.category?.name ?? null,
    campus: item.campus ? String(item.campus.id) : null,
    campusInfo: item.campus ?? null,
    pickupZone: item.pickupZone ?? null,
    locationLabel: locationLabelOf(item.campus, item.pickupZone),
    images: images.map((image) => image.url).filter(Boolean),
    imageItems: images.filter((image) => image.url),
    sellerId: item.seller?.id ?? null,
    seller: toSeller(item.seller),
  }
}

/**
 * Catalog facets: categories keyed by id → by frontend slug; the total of the keyword search is the sum of the
 * category counts (every public listing has exactly one active category).
 */
export function toFacets(facets, categories) {
  if (!facets) return undefined
  const bySlug = {}
  let total = 0
  Object.entries(facets.categories ?? {}).forEach(([id, count]) => {
    total += count
    const category = categories.find((c) => String(c.id) === String(id))
    if (category) bySlug[category.slug] = count
  })
  categories.forEach((c) => {
    bySlug[c.slug] ??= 0
  })
  return { total, categories: bySlug, conditions: facets.conditions ?? {}, campuses: facets.campuses ?? {} }
}

/** Backend field names of a listing request → listing form fields. */
const LISTING_FIELDS = {
  title: 'title',
  description: 'description',
  price: 'price',
  originalPrice: 'originalPrice',
  condition: 'condition',
  categoryId: 'categorySlug',
  campusId: 'campus',
  pickupZoneId: 'pickupZone',
}

/** Error codes that belong to one form field. */
const LISTING_CODES = {
  INVALID_CATEGORY: 'categorySlug',
  INVALID_CAMPUS: 'campus',
  INVALID_ZONE: 'pickupZone',
  IMAGE_REQUIRED: 'photos',
  TOO_MANY_IMAGES: 'photos',
  INVALID_IMAGE: 'photos',
  IMAGE_TOO_LARGE: 'photos',
}

/**
 * Field errors of a failed create / edit for the listing form (ApiError → { field: message }).
 * Unknown fields are left out; the page shows the general message for them.
 */
export function listingFieldErrors(error) {
  const errors = {}
  Object.entries(error?.fieldErrorMap?.() ?? {}).forEach(([field, message]) => {
    const target = LISTING_FIELDS[field] ?? (field.toLowerCase().includes('originalprice') ? 'originalPrice' : null)
    if (target) errors[target] = message
  })
  const byCode = LISTING_CODES[error?.code]
  if (byCode && !errors[byCode]) errors[byCode] = error.message
  return errors
}
