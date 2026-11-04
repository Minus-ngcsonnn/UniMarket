/**
 * Product domain values shared by the whole frontend (Business Plan terminology).
 * Keys (NEW, AVAILABLE, …) are what the API will exchange; labels are what users see.
 */

/** Item condition (Business Plan: New / Like New / Used). */
export const CONDITIONS = {
  NEW: { label: 'New', badge: 'bg-primary-soft text-primary' },
  LIKE_NEW: { label: 'Like new', badge: 'bg-success-soft text-success' },
  USED: { label: 'Used', badge: 'bg-subtle text-ink-muted' },
}
export const CONDITION_KEYS = Object.keys(CONDITIONS)

/** Listing availability (Business Plan: Available → Reserved → Sold). */
export const STATUSES = {
  AVAILABLE: { label: 'Available', tone: 'success' },
  RESERVED: { label: 'Reserved', tone: 'warning' },
  SOLD: { label: 'Sold', tone: 'neutral' },
}
export const STATUS_KEYS = Object.keys(STATUSES)

/** FPT University campuses (Figma catalog filter). Pilot campus: Hanoi (Hoa Lac). */
export const CAMPUSES = {
  HANOI: { label: 'Hanoi' },
  HCMC: { label: 'Ho Chi Minh City' },
  DA_NANG: { label: 'Da Nang' },
  CAN_THO: { label: 'Can Tho' },
}
export const CAMPUS_KEYS = Object.keys(CAMPUSES)
export const UNIVERSITY_NAME = 'FPT University'

/** Sort options (Figma catalog: Newest, Price: Low to High). */
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
]
export const DEFAULT_SORT = 'newest'

/** Catalog paging and price filter bounds (VND). */
export const CATALOG_PAGE_SIZE = 9
/** "Student deals": listings at least this % below their original price. */
export const DEAL_MIN_SAVINGS = 40
export const PRICE_FILTER_MAX = 10_000_000
export const PRICE_FILTER_STEP = 50_000

/** Listing form limits (Q2 decision: JPG/PNG/WebP, max 5 MB per photo, max 8 photos). */
export const LISTING_LIMITS = {
  titleMin: 5,
  titleMax: 80,
  descriptionMin: 20,
  descriptionMax: 1000,
  priceMin: 1_000,
  priceMax: 100_000_000,
  photosMax: 8,
  photoMaxBytes: 5 * 1024 * 1024,
  photoTypes: ['image/jpeg', 'image/png', 'image/webp'],
}

/** Initial values of the Create Listing form. */
export const EMPTY_LISTING = {
  photos: [],
  title: '',
  categorySlug: '',
  condition: '',
  description: '',
  price: null,
  originalPrice: null,
  campus: 'HANOI', // pilot campus (Hoa Lac); the student can change it. Real API: the seller's campus id, or ''
  pickupZone: '', // real API (V003): demo pickup area id; required for sellers without a campus
}

/**
 * Empty Create Listing values for a real account (GET /api/auth/me): the seller's own campus, else no campus and the
 * seller's home area (if any) as pickup area. Nothing is assigned from the email address.
 */
export function emptyListingFor(user) {
  const campusId = user?.affiliation?.campusId ?? user?.campusId ?? null
  return {
    ...EMPTY_LISTING,
    campus: campusId != null ? String(campusId) : '',
    pickupZone: campusId == null && user?.homeZone?.id != null ? String(user.homeZone.id) : '',
  }
}

/** Turns an existing product into Edit Listing form values. */
export function listingToFormValues(product) {
  return {
    // Real API photos carry their ProductImages id (needed to delete / reorder); sample photos are URLs only.
    photos: product.imageItems
      ? product.imageItems.map((image, index) => ({ id: `existing-${image.id ?? index}`, imageId: image.id, url: image.url, name: `Photo ${index + 1}`, isLocal: false }))
      : product.images.map((url, index) => ({ id: `existing-${index}`, url, name: `Photo ${index + 1}`, isLocal: false })),
    title: product.title,
    categorySlug: product.categorySlug,
    condition: product.condition,
    description: product.description,
    price: product.price,
    originalPrice: product.originalPrice ?? null,
    campus: product.campus ?? '',
    pickupZone: product.pickupZone?.id != null ? String(product.pickupZone.id) : '',
  }
}

/** Human-readable listing code, as in the Figma admin table (e.g. UM-2048). */
export function listingCode(id) {
  return `UM-${id}`
}
