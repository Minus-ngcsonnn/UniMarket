import apiClient from '../apiClient'
import { session } from '../auth/session'
import { normalizeCustomCategory } from '../../constants/product'
import { findCampus, findCategory, loadCatalogReference } from './catalogReference'
import { toFacets, toProduct } from './productMapper'

/**
 * Real product API (UniMarket backend, docs/PRODUCTS_API.md). Same functions and return shapes as
 * src/mocks/mockProductApi.js, so pages work with either; selected by vite.config.js (VITE_USE_MOCK_PRODUCTS).
 * Every failure rejects with an ApiError (services/apiError.js). Listings that are not public answer 404, which
 * getProduct / getMyListing turn into null ("not found"), like the sample implementation.
 */

/** Kept for the order / account / admin stubs that are not connected yet (later stages). */
export class BackendPendingError extends Error {
  constructor(feature) {
    super(`${feature} isn’t connected to the UniMarket backend yet.`)
    this.name = 'BackendPendingError'
  }
}

/** Backend page size limit (CatalogController.MAX_PAGE_SIZE). */
const MAX_PAGE_SIZE = 50
const isId = (value) => /^\d{1,9}$/.test(String(value))
const notFoundToNull = (error) => {
  if (error?.status === 404) return null
  throw error
}

/**
 * GET /api/products. Filters are sent to the backend, which filters, counts and pages the whole catalog.
 * @param {object} params { q, category (slug), conditions[], campuses[] (campus keys), zone, province, minPrice, maxPrice,
 *   sort, featured, deals, sellerId, page, pageSize }
 * @returns {Promise<{ items, total, page, pageSize, facets }>}
 */
async function listProducts(params = {}) {
  const reference = await loadCatalogReference()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 20))
  const query = { page, size: pageSize }
  if (params.q) query.q = params.q.slice(0, 100)
  if (params.category) {
    // Unknown category in an old link: id 0 matches nothing, so the page says "no items" instead of showing everything.
    query.categoryId = findCategory(reference, params.category)?.id ?? 0
  }
  if (params.conditions?.length) query.condition = params.conditions.join(',')
  // The backend filters one campus at a time (campusId); the filter panel allows one selection.
  if (params.campuses?.length) query.campusId = findCampus(reference, params.campuses[0])?.id ?? 0
  if (params.zone) query.zoneId = params.zone
  if (params.province) query.province = params.province
  if (params.minPrice != null) query.minPrice = params.minPrice
  if (params.maxPrice != null) query.maxPrice = params.maxPrice
  // The backend default is 'recommended' (featured first); every other sort is sent explicitly.
  if (params.sort && params.sort !== 'recommended') query.sort = params.sort
  if (params.featured) query.featured = true
  if (params.deals) query.deals = true
  if (params.sellerId != null) query.sellerId = params.sellerId

  const { data } = await apiClient.get('/products', { params: query })
  return {
    items: data.items.map(toProduct),
    total: data.totalItems,
    page: data.page,
    pageSize: data.size,
    totalPages: data.totalPages,
    facets: toFacets(data.facets, reference.categories),
  }
}

/**
 * Blocked listing of the signed-in seller: adds the admin's latest reason (GET /api/me/products/{id}/moderation,
 * Stage 5; no admin identity) as `moderationNote`. Any failure leaves the note empty instead of failing the page.
 */
async function withModerationNote(product) {
  if (!product || product.moderation !== 'BLOCKED' || product.sellerId !== getCurrentUserId()) return product
  try {
    const { data } = await apiClient.get(`/me/products/${product.id}/moderation`)
    const decision = [...data].reverse().find((event) => (event.action === 'REJECTED' || event.action === 'BLOCKED') && event.reason)
    return { ...product, moderationNote: decision?.reason ?? null }
  } catch {
    return product
  }
}

/** GET /api/products/{id}: public listing, or the signed-in seller's own (also pending / blocked). null when hidden. */
async function getProduct(id) {
  if (!isId(id)) return null
  const product = await apiClient.get(`/products/${id}`).then(({ data }) => toProduct(data), notFoundToNull)
  return withModerationNote(product)
}

/** GET /api/products/by-ids (public listings only, in the requested order; hidden ones are left out). */
async function getProductsByIds(ids) {
  const wanted = [...new Set(ids.filter(isId).map(Number))]
  const chunks = []
  for (let i = 0; i < wanted.length; i += MAX_PAGE_SIZE) chunks.push(wanted.slice(i, i + MAX_PAGE_SIZE))
  const pages = await Promise.all(chunks.map((chunk) => apiClient.get('/products/by-ids', { params: { ids: chunk.join(',') } })))
  return pages.flatMap(({ data }) => data.map(toProduct))
}

/** A student's public available listings (public profile), newest first. */
async function listUserListings(userId) {
  if (!isId(userId)) return []
  const result = await listProducts({ sellerId: userId, pageSize: MAX_PAGE_SIZE })
  return result.items
}

/** Id of the signed-in account (from GET /api/auth/me), or null. */
function getCurrentUserId() {
  return session.getSnapshot().user?.id ?? null
}

/** GET /api/me/products: own listings except removed ones, with moderation and editable. */
async function listMyListings() {
  const { data } = await apiClient.get('/me/products')
  return Promise.all(data.map(toProduct).map(withModerationNote))
}

/** One of the signed-in seller's listings for editing; null when it does not exist or is someone else's. */
async function getMyListing(id) {
  const product = await getProduct(id)
  return product && product.isOwnerView && product.sellerId === getCurrentUserId() ? product : null
}

/** Listing fields of a form payload → ListingRequest JSON. */
async function toListingRequest(payload) {
  const reference = await loadCatalogReference()
  const category = findCategory(reference, payload.categorySlug)
  const body = {
    title: payload.title,
    description: payload.description,
    price: payload.price,
    originalPrice: payload.originalPrice ?? null,
    condition: payload.condition,
    // An unknown category is sent as 0, so the backend answers with a field error.
    categoryId: category?.id ?? 0,
  }
  // V005: only the "Other" category carries the seller-typed name; it is never sent as a category id.
  if (category?.custom) body.customCategory = normalizeCustomCategory(payload.customCategory)
  if (payload.campus) body.campusId = Number(payload.campus)
  if (payload.pickupZone) body.pickupZoneId = Number(payload.pickupZone)
  return body
}

/**
 * POST /api/products (multipart: JSON part "listing" + files "photos"). New listings wait for admin approval.
 * @param {object} payload see hooks/useListingSubmit.js; photos = [{ file }]
 * @param {{ onUploadProgress?: (percent: number) => void }} [options]
 * @returns {Promise<{ saved: true, product }>}
 */
async function createListing(payload, options = {}) {
  const form = new FormData()
  form.append('listing', new Blob([JSON.stringify(await toListingRequest(payload))], { type: 'application/json' }))
  payload.photos.filter((photo) => photo.file).forEach((photo) => form.append('photos', photo.file, photo.file.name))
  const { data } = await apiClient.post('/products', form, uploadConfig(options))
  return { saved: true, product: toProduct(data) }
}

function uploadConfig({ onUploadProgress } = {}) {
  return {
    // multipart: axios keeps the FormData and the browser sets the boundary.
    headers: { 'Content-Type': 'multipart/form-data' },
    // Photos can be large (8 × 5 MB): allow more than the default 15 s.
    timeout: 120_000,
    onUploadProgress: onUploadProgress
      ? (event) => event.total && onUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      : undefined,
  }
}

/**
 * Saves an edited listing: PUT the fields, then apply photo changes (delete removed, upload new, reorder) so the
 * backend's limits (1–8 photos) hold at every step. Every change sends the listing back to admin review.
 * @param {object} payload photos = [{ imageId, url }] (kept) or [{ file }] (new), in the wanted order
 * @returns {Promise<{ saved: true, product }>}
 */
async function updateListing(id, payload, options = {}) {
  const { data: updated } = await apiClient.put(`/products/${id}`, await toListingRequest(payload))
  try {
    return await applyPhotoChanges(id, updated, payload, options)
  } catch (error) {
    // The details are already saved; tell the page that only some photo changes may be missing.
    error.partiallySaved = true
    throw error
  }
}

async function applyPhotoChanges(id, updated, payload, options) {
  let current = updated
  const kept = payload.photos.filter((photo) => photo.imageId != null).map((photo) => photo.imageId)
  const newFiles = payload.photos.filter((photo) => photo.file).map((photo) => photo.file)
  const removed = current.images.map((image) => image.id).filter((imageId) => !kept.includes(imageId))

  // The last photo can't be deleted: when every old photo goes, keep one until the new ones are uploaded.
  const deleteLater = kept.length === 0 && newFiles.length > 0 ? removed.slice(0, 1) : []
  for (const imageId of removed.filter((imageId) => !deleteLater.includes(imageId))) {
    current = (await apiClient.delete(`/products/${id}/images/${imageId}`)).data
  }
  let uploadedIds = []
  if (newFiles.length) {
    const before = new Set(current.images.map((image) => image.id))
    const form = new FormData()
    newFiles.forEach((file) => form.append('photos', file, file.name))
    current = (await apiClient.post(`/products/${id}/images`, form, uploadConfig(options))).data
    uploadedIds = current.images
      .filter((image) => !before.has(image.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => image.id)
  }
  for (const imageId of deleteLater) {
    current = (await apiClient.delete(`/products/${id}/images/${imageId}`)).data
  }

  // Final order as shown in the form: kept photos by id, new photos in upload order.
  let nextUploaded = 0
  const order = payload.photos.map((photo) => (photo.imageId != null ? photo.imageId : uploadedIds[nextUploaded++])).filter((imageId) => imageId != null)
  const currentOrder = [...current.images].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => image.id)
  if (order.length === currentOrder.length && order.some((imageId, index) => imageId !== currentOrder[index])) {
    current = (await apiClient.put(`/products/${id}/images/order`, { imageIds: order })).data
  }
  return { saved: true, product: toProduct(current) }
}

/** DELETE /api/products/{id}: soft delete (Status = Removed; rows and photos are kept). */
async function deleteListing(id) {
  await apiClient.delete(`/products/${id}`)
  return { saved: true }
}

export default {
  listProducts,
  getProduct,
  getProductsByIds,
  listUserListings,
  getCurrentUserId,
  listMyListings,
  getMyListing,
  createListing,
  updateListing,
  deleteListing,
}
