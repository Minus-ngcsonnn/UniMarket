/**
 * SAMPLE IMPLEMENTATION of the order API for frontend development.
 * Same function signatures as src/services/orders/orderApi.js.
 *
 * Q3 (approved): one order per seller. Each order has `items` (one per listing) and an `amount` total.
 *
 * To let the whole Business Plan flow be tried end to end, this mock stores orders in THIS BROWSER
 * (localStorage, see sampleStore.js): placing an order reserves its listings, cancelling/declining frees
 * them, completing marks them sold. Data survives reloads and is shared between tabs until
 * resetSampleData() is called. Payments are simulated; no money moves.
 *
 * The signed-in student is the sample user (MOCK_CURRENT_USER_ID). simulateOtherParty() performs the
 * next step of the other person (seller or buyer) so one person can try both sides of the flow.
 */
import { NEEDS_ACTION, SELLER_CONFIRM_HOURS } from '../constants/order'
import { simulateNetwork } from './network'
import { MOCK_CURRENT_USER_ID, MOCK_PRODUCTS, MOCK_SELLERS } from './products'
import { applySavedProductStatuses, clearSampleState, loadSampleState, saveSampleState } from './sampleStore'

const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString()
const now = () => new Date().toISOString()
const plusHours = (iso, hours) => new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString()

/** The sample orders a fresh browser starts with (also used by "Reset sample data"). */
const seedOrders = () => [
  {
    id: 3002,
    productIds: [2043], // Adjustable LED desk lamp (sample user's listing, reserved by this order)
    sellerId: MOCK_CURRENT_USER_ID,
    buyerId: 'u-mai',
    amount: 250_000,
    status: 'PENDING',
    createdAt: hoursAgo(1),
    confirmBy: plusHours(hoursAgo(1), SELLER_CONFIRM_HOURS),
    delivery: { fullName: 'Mai Vo', phone: '0912345678', campus: 'HANOI', address: 'Dormitory C, room 214', note: 'Could you deliver after 5 pm?' },
    paymentMethod: null,
    timeline: [{ status: 'PENDING', at: hoursAgo(1) }],
  },
  {
    id: 3001,
    productIds: [2041], // Organic Chemistry (sample user's listing, sold through this order)
    sellerId: MOCK_CURRENT_USER_ID,
    buyerId: 'u-linh',
    amount: 380_000,
    status: 'COMPLETED',
    createdAt: hoursAgo(80),
    confirmBy: plusHours(hoursAgo(80), SELLER_CONFIRM_HOURS),
    delivery: { fullName: 'Linh Tran', phone: '0987654321', campus: 'HANOI', address: 'Alpha building, library entrance', note: '' },
    paymentMethod: 'MOMO',
    timeline: [
      { status: 'PENDING', at: hoursAgo(80) },
      { status: 'AWAITING_PAYMENT', at: hoursAgo(78) },
      { status: 'PAID', at: hoursAgo(77) },
      { status: 'DELIVERING', at: hoursAgo(60) },
      { status: 'COMPLETED', at: hoursAgo(54) },
    ],
  },
]
const FIRST_NEW_ORDER_ID = 3003

let orders = seedOrders()
let nextOrderId = FIRST_NEW_ORDER_ID

/** Loads the latest saved sample state (it survives reloads and may have changed in another tab). */
function syncFromStorage() {
  const saved = loadSampleState()
  if (!saved) return
  orders = saved.orders
  nextOrderId = saved.nextOrderId
  applySavedProductStatuses(MOCK_PRODUCTS)
}

/** Saves orders and the listing statuses they changed, after every change. */
function persist() {
  saveSampleState({ orders, nextOrderId, productStatuses: Object.fromEntries(MOCK_PRODUCTS.map((p) => [p.id, p.status])) })
}

/** Simulated network delay, then the latest saved state. */
async function ready() {
  await simulateNetwork()
  syncFromStorage()
}

const findProduct = (id) => MOCK_PRODUCTS.find((p) => p.id === Number(id))
const isParticipant = (order) => order.buyerId === MOCK_CURRENT_USER_ID || order.sellerId === MOCK_CURRENT_USER_ID

function withDetails(order) {
  return {
    ...order,
    productIds: [...order.productIds],
    timeline: [...order.timeline],
    items: order.productIds.map((id) => {
      const product = findProduct(id)
      return {
        productId: id,
        title: product?.title ?? 'Listing removed',
        image: product?.images[0],
        condition: product?.condition,
        categorySlug: product?.categorySlug,
        price: product?.price ?? 0,
      }
    }),
    seller: MOCK_SELLERS[order.sellerId],
    buyer: MOCK_SELLERS[order.buyerId],
    role: order.buyerId === MOCK_CURRENT_USER_ID ? 'buyer' : 'seller',
  }
}

function setStatus(order, status) {
  order.status = status
  order.timeline.push({ status, at: now() })
  order.productIds.map(findProduct).forEach((product) => {
    if (!product) return
    if (status === 'CANCELLED') product.status = 'AVAILABLE'
    if (status === 'COMPLETED') product.status = 'SOLD'
  })
}

/** Applies one step of the flow after checking who may do it and when. */
async function transition(orderId, { from, to, actor }, extra = {}) {
  await ready()
  const order = orders.find((o) => o.id === Number(orderId))
  if (!order) throw new Error('Order not found.')
  const actorId = actor === 'buyer' ? order.buyerId : order.sellerId
  if (actorId !== MOCK_CURRENT_USER_ID && !extra.simulated) throw new Error('You can’t change this order.')
  if (!from.includes(order.status)) throw new Error('This order has already moved on. Please refresh.')
  Object.assign(order, extra.fields)
  setStatus(order, to)
  persist()
  return withDetails(order)
}

/** @param {{ role: 'buyer'|'seller' }} params */
async function listOrders({ role }) {
  await ready()
  const key = role === 'seller' ? 'sellerId' : 'buyerId'
  return orders
    .filter((o) => o[key] === MOCK_CURRENT_USER_ID)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(withDetails)
}

/** One order the signed-in student takes part in (as buyer or seller), or null. */
async function getOrder(id) {
  await ready()
  const order = orders.find((o) => o.id === Number(id))
  return order && isParticipant(order) ? withDetails(order) : null
}

async function getOrders(ids) {
  await ready()
  const wanted = new Set(ids.map(Number))
  return orders.filter((o) => wanted.has(o.id) && isParticipant(o)).map(withDetails)
}

/** How many orders are waiting for the signed-in student to act (header badge). */
async function getActionCounts() {
  await ready()
  return {
    buyer: orders.filter((o) => o.buyerId === MOCK_CURRENT_USER_ID && NEEDS_ACTION.buyer.includes(o.status)).length,
    seller: orders.filter((o) => o.sellerId === MOCK_CURRENT_USER_ID && NEEDS_ACTION.seller.includes(o.status)).length,
  }
}

/**
 * Places the buyer's order(s): the listings are grouped by seller and each seller gets ONE order (Q3).
 * @param {{ productIds: number[], delivery: object }} request
 * @returns {Promise<{ orders: object[], isSample: boolean }>}
 */
async function placeOrders({ productIds, delivery }) {
  await ready()
  if (productIds.length === 0) throw new Error('Choose at least one item to order.')
  const products = productIds.map(findProduct)
  // findIndex (not find): a missing product is `undefined` in the array, which find() can't report.
  const problemIndex = products.findIndex((p) => !p || p.status !== 'AVAILABLE' || p.sellerId === MOCK_CURRENT_USER_ID)
  if (problemIndex !== -1) {
    const problem = products[problemIndex]
    if (!problem) throw new Error('One of the listings no longer exists. Please review your cart.')
    if (problem.sellerId === MOCK_CURRENT_USER_ID) throw new Error(`“${problem.title}” is your own listing.`)
    throw new Error(`“${problem.title}” is no longer available. Please review your cart.`)
  }

  const bySeller = new Map()
  products.forEach((product) => bySeller.set(product.sellerId, [...(bySeller.get(product.sellerId) ?? []), product]))

  const createdAt = now()
  const created = [...bySeller.entries()].map(([sellerId, sellerProducts]) => {
    const order = {
      id: nextOrderId++,
      productIds: sellerProducts.map((p) => p.id),
      sellerId,
      buyerId: MOCK_CURRENT_USER_ID,
      amount: sellerProducts.reduce((sum, p) => sum + p.price, 0),
      status: 'PENDING',
      createdAt,
      confirmBy: plusHours(createdAt, SELLER_CONFIRM_HOURS),
      delivery: { ...delivery },
      paymentMethod: null,
      timeline: [{ status: 'PENDING', at: createdAt }],
    }
    sellerProducts.forEach((product) => {
      product.status = 'RESERVED'
    })
    orders.push(order)
    return withDetails(order)
  })
  persist()
  return { orders: created, isSample: true }
}

// Buyer actions
const cancelOrder = (id) => transition(id, { from: ['PENDING', 'AWAITING_PAYMENT'], to: 'CANCELLED', actor: 'buyer' })
const payOrder = (id, method) => transition(id, { from: ['AWAITING_PAYMENT'], to: 'PAID', actor: 'buyer' }, { fields: { paymentMethod: method } })
const confirmReceived = (id) => transition(id, { from: ['DELIVERING'], to: 'COMPLETED', actor: 'buyer' })

// Seller actions (on the whole order)
const confirmOrder = (id) => transition(id, { from: ['PENDING'], to: 'AWAITING_PAYMENT', actor: 'seller' })
const declineOrder = (id) => transition(id, { from: ['PENDING'], to: 'CANCELLED', actor: 'seller' })
const markDelivering = (id) => transition(id, { from: ['PAID'], to: 'DELIVERING', actor: 'seller' })

/** SAMPLE MODE ONLY: performs the other person's next step (seller confirms/delivers, buyer pays/receives). */
async function simulateOtherParty(id) {
  syncFromStorage()
  const order = orders.find((o) => o.id === Number(id))
  if (!order) throw new Error('Order not found.')
  const steps = {
    PENDING: { from: ['PENDING'], to: 'AWAITING_PAYMENT' },
    AWAITING_PAYMENT: { from: ['AWAITING_PAYMENT'], to: 'PAID', fields: { paymentMethod: 'MOMO' } },
    PAID: { from: ['PAID'], to: 'DELIVERING' },
    DELIVERING: { from: ['DELIVERING'], to: 'COMPLETED' },
  }
  const step = steps[order.status]
  if (!step) throw new Error('There is nothing left to simulate for this order.')
  return transition(id, { from: step.from, to: step.to, actor: 'buyer' }, { simulated: true, fields: step.fields })
}

/**
 * SAMPLE MODE ONLY: forgets saved sample orders and listing statuses. The caller reloads the page so
 * every sample module starts again from the original data.
 */
async function resetSampleData() {
  clearSampleState()
  orders = seedOrders()
  nextOrderId = FIRST_NEW_ORDER_ID
}

export default {
  listOrders,
  getOrder,
  getOrders,
  getActionCounts,
  placeOrders,
  cancelOrder,
  payOrder,
  confirmReceived,
  confirmOrder,
  declineOrder,
  markDelivering,
  simulateOtherParty,
  resetSampleData,
}
