import apiClient from '../apiClient'
import { session } from '../auth/session'
import { BackendPendingError } from '../products/productApi'
import { toOrder, toQuote } from './orderMapper'

/**
 * Real order API (docs/ORDERS_API.md, V002 procedures + V003 simulated shipping). Same functions as
 * src/mocks/mockOrderApi.js plus the real-only ones (quoteShipping, checkout, startPayment, completeSimulatedPayment).
 * Selected by vite.config.js (VITE_USE_MOCK_ORDERS). Every state change is decided by the backend; this module never
 * marks anything paid, never sends a shipping amount and never recalculates money.
 */

const isId = (value) => /^\d{1,12}$/.test(String(value))
const notFoundToNull = (error) => {
  if (error?.status === 404) return null
  throw error
}
const MAX_PAGES = 4 // up to 200 orders per list (size 50); older ones stay reachable by id

/** GET /api/orders?role=buyer|seller, newest first (all pages up to MAX_PAGES). */
async function listOrders({ role }) {
  const orders = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await apiClient.get('/orders', { params: { role, page, size: 50 } })
    orders.push(...data.items.map(toOrder))
    if (page >= data.totalPages) break
  }
  return orders
}

/** GET /api/orders/{id}; null when it does not exist or belongs to someone else (404). */
async function getOrder(id) {
  if (!isId(id)) return null
  return apiClient.get(`/orders/${id}`).then(({ data }) => toOrder(data), notFoundToNull)
}

/** GET /api/orders/by-ids (orders of the signed-in account only). */
async function getOrders(ids) {
  const wanted = [...new Set(ids.filter(isId).map(Number))].slice(0, 50)
  if (!wanted.length) return []
  const { data } = await apiClient.get('/orders/by-ids', { params: { ids: wanted.join(',') } })
  return data.map(toOrder)
}

/** GET /api/orders/action-counts → { buyer, seller }. Visitors get zeros without a request (header polling). */
async function getActionCounts() {
  if (session.getSnapshot().status !== 'authenticated') return { buyer: 0, seller: 0 }
  const { data } = await apiClient.get('/orders/action-counts')
  return { buyer: data.buyer ?? 0, seller: data.seller ?? 0 }
}

/** POST /api/shipping/quotes: simulated per-seller quotes with signed tokens (15 minutes). */
async function quoteShipping(productIds, deliveryZoneId) {
  const { data } = await apiClient.post('/shipping/quotes', { productIds, deliveryZoneId: Number(deliveryZoneId) })
  return toQuote(data)
}

/**
 * POST /api/checkout (one order per seller, all or nothing). Prices and fees come from the database and the signed
 * quotes; `expectedPrices` lets the server refuse if a price changed since the buyer saw it.
 * @returns {Promise<{ orders, subtotal, shippingFee, total }>}
 */
async function checkout(request) {
  const { data } = await apiClient.post('/checkout', request, { timeout: 30_000 })
  return { orders: data.orders.map(toOrder), subtotal: data.subtotal, shippingFee: data.shippingFee, total: data.total }
}

/** Sample-data signature kept for compatibility: the real checkout needs shipping quotes (use checkout()). */
async function placeOrders() {
  throw new BackendPendingError('Checkout without a shipping quote')
}

const action = (path, body) => async (id, payload) => {
  const { data } = await apiClient.post(`/orders/${id}/${path}`, body ? body(payload) : undefined)
  return toOrder(data)
}

/**
 * POST /api/orders/{id}/payments: starts (201) or resumes (200) a payment attempt. This never marks the order paid.
 * @returns {Promise<{ paymentId, amount, provider, status, sandbox, resumed, paymentDueAt, simulatorUrl?, bankQr? }>}
 */
async function startPayment(id, provider) {
  const { data } = await apiClient.post(`/orders/${id}/payments`, provider ? { provider } : {})
  return data
}

/**
 * Sandbox only: finishes a simulated payment through the backend simulator (`simulatorUrl` from the attempt). The
 * simulator signs a provider-style notification; the order becomes PAID only after server-side verification.
 * @param {'SUCCESS'|'FAILURE'} outcome
 */
async function completeSimulatedPayment(simulatorUrl, outcome) {
  if (!simulatorUrl?.startsWith('/api/dev/payment-simulator/')) throw new BackendPendingError('Online payment')
  const { data } = await apiClient.post(simulatorUrl.replace(/^\/api/, ''), { outcome })
  return toOrder(data)
}

const unavailable = (feature) => () => Promise.reject(new BackendPendingError(feature))

export default {
  listOrders,
  getOrder,
  getOrders,
  getActionCounts,
  placeOrders,
  quoteShipping,
  checkout,
  startPayment,
  completeSimulatedPayment,
  // Buyer
  cancelOrder: action('cancel', (reason) => (reason ? { reason } : {})),
  payOrder: unavailable('Paying without a payment attempt'),
  confirmReceived: action('confirm-receipt'),
  // Seller (whole order)
  confirmOrder: action('confirm'),
  declineOrder: action('cancel', (reason) => (reason ? { reason } : {})),
  markDelivering: action('ship', (shipment) => ({ carrier: shipment?.carrier?.slice(0, 100) || undefined, trackingNumber: shipment?.trackingNumber?.slice(0, 100) || undefined })),
  // Sample-data helpers do not exist with the real API.
  simulateOtherParty: unavailable('Simulating the other person'),
  resetSampleData: unavailable('Resetting sample data'),
}
