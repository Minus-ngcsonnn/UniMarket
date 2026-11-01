/**
 * SAMPLE IMPLEMENTATION of the product API for frontend development (no backend, no persistence).
 * Same function signatures as src/services/products/productApi.js.
 *
 * - Reads (list/get) filter, sort and page the sample data in memory.
 * - Writes (create/update/delete) DO NOT change anything. They resolve with { saved: false }
 *   so the UI can show that the action is a preview only.
 *
 * Dev helpers: add ?simulate=error or ?simulate=slow to the page URL to test error and loading states.
 */
import { CATEGORIES } from '../constants/categories'
import { CATALOG_PAGE_SIZE, CONDITION_KEYS, CAMPUS_KEYS, DEAL_MIN_SAVINGS } from '../constants/product'
import { simulateNetwork } from './network'
import { MOCK_CURRENT_USER_ID, MOCK_PRODUCTS, MOCK_SELLERS } from './products'

function withSeller(product) {
  return { ...product, seller: MOCK_SELLERS[product.sellerId] }
}

function matchesQuery(product, query) {
  if (!query) return true
  const needle = query.toLowerCase()
  return `${product.title} ${product.description}`.toLowerCase().includes(needle)
}

const savingsPercent = (p) => (p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0)

function countBy(products, key, values) {
  return Object.fromEntries(values.map((value) => [value, products.filter((p) => p[key] === value).length]))
}

/**
 * @param {object} params
 * @param {string} [params.q] search text
 * @param {string} [params.category] category slug
 * @param {string[]} [params.conditions] condition keys
 * @param {string[]} [params.campuses] campus keys
 * @param {number} [params.minPrice]
 * @param {number} [params.maxPrice]
 * @param {'newest'|'price_asc'} [params.sort]
 * @param {boolean} [params.featured]
 * @param {number} [params.page] 1-based
 * @param {number} [params.pageSize]
 * @returns {Promise<{ items, total, page, pageSize, facets }>}
 */
async function listProducts(params = {}) {
  await simulateNetwork()
  const { q, category, conditions = [], campuses = [], minPrice, maxPrice, sort = 'newest', featured, deals, page = 1 } = params
  const pageSize = params.pageSize ?? CATALOG_PAGE_SIZE

  // Only available listings are shown in the marketplace.
  const searchable = MOCK_PRODUCTS.filter((p) => p.status === 'AVAILABLE' && matchesQuery(p, q))

  const filtered = searchable.filter(
    (p) =>
      (!category || p.categorySlug === category) &&
      (conditions.length === 0 || conditions.includes(p.condition)) &&
      (campuses.length === 0 || campuses.includes(p.campus)) &&
      (minPrice == null || p.price >= minPrice) &&
      (maxPrice == null || p.price <= maxPrice) &&
      (!featured || p.featured) &&
      (!deals || savingsPercent(p) >= DEAL_MIN_SAVINGS),
  )

  const sorted = [...filtered].sort((a, b) => {
    if (deals) return savingsPercent(b) - savingsPercent(a)
    return sort === 'price_asc' ? a.price - b.price : new Date(b.createdAt) - new Date(a.createdAt)
  })

  const start = (page - 1) * pageSize
  return {
    items: sorted.slice(start, start + pageSize).map(withSeller),
    total: sorted.length,
    page,
    pageSize,
    // Counts for the filter sidebar, based on the search text only.
    facets: {
      total: searchable.length,
      categories: countBy(searchable, 'categorySlug', CATEGORIES.map((c) => c.slug)),
      conditions: countBy(searchable, 'condition', CONDITION_KEYS),
      campuses: countBy(searchable, 'campus', CAMPUS_KEYS),
    },
  }
}

/** @returns {Promise<object|null>} the product with its seller, or null when it does not exist */
async function getProduct(id) {
  await simulateNetwork()
  const product = MOCK_PRODUCTS.find((p) => String(p.id) === String(id))
  return product ? withSeller(product) : null
}

/** Several products by ID (cart, checkout). Missing IDs are left out. */
async function getProductsByIds(ids) {
  await simulateNetwork()
  const wanted = new Set(ids.map(String))
  return MOCK_PRODUCTS.filter((p) => wanted.has(String(p.id))).map(withSeller)
}

/** ID of the signed-in student (sample user), or null when nobody is signed in. */
function getCurrentUserId() {
  return MOCK_CURRENT_USER_ID
}

/** Listings of the signed-in student (sample user). */
async function listMyListings() {
  await simulateNetwork()
  return MOCK_PRODUCTS.filter((p) => p.sellerId === MOCK_CURRENT_USER_ID)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(withSeller)
}

/** One of the signed-in student's listings, for editing. null when not found or not owned. */
async function getMyListing(id) {
  await simulateNetwork()
  const product = MOCK_PRODUCTS.find((p) => String(p.id) === String(id) && p.sellerId === MOCK_CURRENT_USER_ID)
  return product ? withSeller(product) : null
}

// Writes: preview only, nothing is stored.
async function createListing() {
  await simulateNetwork()
  return { saved: false }
}

async function updateListing() {
  await simulateNetwork()
  return { saved: false }
}

async function deleteListing() {
  await simulateNetwork()
  return { saved: false }
}

export default {
  listProducts,
  getProduct,
  getProductsByIds,
  getCurrentUserId,
  listMyListings,
  getMyListing,
  createListing,
  updateListing,
  deleteListing,
}
