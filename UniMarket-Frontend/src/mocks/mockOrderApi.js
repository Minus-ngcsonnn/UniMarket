/**
 * SAMPLE IMPLEMENTATION of the order API for frontend development.
 * Same function signatures as src/services/orders/orderApi.js.
 *
 * To let the whole Business Plan flow be tried end to end, this mock keeps orders IN MEMORY:
 * placing an order reserves the listing, cancelling frees it, completing marks it sold.
 * Everything resets when the page is reloaded. Payments are simulated; no money moves.
 *
 * The signed-in student is the sample user (MOCK_CURRENT_USER_ID). simulateOtherParty() performs the
 * next step of the other person (seller or buyer) so one person can try both sides of the flow.
 */
import { SELLER_CONFIRM_HOURS } from '../constants/order'
import { simulateNetwork } from './network'
import { MOCK_CURRENT_USER_ID, MOCK_PRODUCTS, MOCK_SELLERS } from './products'

const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString()
const now = () => new Date().toISOString()
const plusHours = (iso, hours) => new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString()

const orders = [
  {
    id: 3002,
    productId: 2043, // Adjustable LED desk lamp (sample user's listing, reserved by this order)
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
    productId: 2041, // Organic Chemistry (sample user's listing, sold through this order)
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
let nextOrderId = 3003

const findProduct = (id) => MOCK_PRODUCTS.find((p) => p.id === id)

function withDetails(order) {
  const product = findProduct(order.productId)
  return {
    ...order,
    timeline: [...order.timeline],
    product: product && { id: product.id, title: product.title, image: product.images[0], condition: product.condition, categorySlug: product.categorySlug },
    seller: MOCK_SELLERS[order.sellerId],
    buyer: MOCK_SELLERS[order.buyerId],
  }
}

function setStatus(order, status) {
  order.status = status
  order.timeline.push({ status, at: now() })
  const product = findProduct(order.productId)
  if (!product) return
  if (status === 'CANCELLED') product.status = 'AVAILABLE'
  if (status === 'COMPLETED') product.status = 'SOLD'
}

/** Applies one step of the flow after checking who may do it and when. */
async function transition(orderId, { from, to, actor }, extra = {}) {
  await simulateNetwork()
  const order = orders.find((o) => o.id === Number(orderId))
  if (!order) throw new Error('Order not found.')
  const actorId = actor === 'buyer' ? order.buyerId : order.sellerId
  if (actorId !== MOCK_CURRENT_USER_ID && !extra.simulated) throw new Error('You can’t change this order.')
  if (!from.includes(order.status)) throw new Error('This order has already moved on. Please refresh.')
  Object.assign(order, extra.fields)
  setStatus(order, to)
  return withDetails(order)
}

/** @param {{ role: 'buyer'|'seller' }} params */
async function listOrders({ role }) {
  await simulateNetwork()
  const key = role === 'seller' ? 'sellerId' : 'buyerId'
  return orders
    .filter((o) => o[key] === MOCK_CURRENT_USER_ID)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(withDetails)
}

async function getOrders(ids) {
  await simulateNetwork()
  const wanted = new Set(ids.map(Number))
  return orders.filter((o) => wanted.has(o.id) && (o.buyerId === MOCK_CURRENT_USER_ID || o.sellerId === MOCK_CURRENT_USER_ID)).map(withDetails)
}

/**
 * Places one order per listing (Business Plan: seller confirms each order).
 * @param {{ productIds: number[], delivery: object }} request
 * @returns {Promise<{ orders: object[], isSample: boolean }>}
 */
async function placeOrders({ productIds, delivery }) {
  await simulateNetwork()
  if (productIds.length === 0) throw new Error('Choose at least one item to order.')
  const products = productIds.map((id) => findProduct(Number(id)))
  // findIndex (not find): a missing product is `undefined` in the array, which find() can't report.
  const problemIndex = products.findIndex((p) => !p || p.status !== 'AVAILABLE' || p.sellerId === MOCK_CURRENT_USER_ID)
  if (problemIndex !== -1) {
    const problem = products[problemIndex]
    if (!problem) throw new Error('One of the listings no longer exists. Please review your cart.')
    if (problem.sellerId === MOCK_CURRENT_USER_ID) throw new Error(`“${problem.title}” is your own listing.`)
    throw new Error(`“${problem.title}” is no longer available. Please review your cart.`)
  }

  const createdAt = now()
  const created = products.map((product) => {
    const order = {
      id: nextOrderId++,
      productId: product.id,
      sellerId: product.sellerId,
      buyerId: MOCK_CURRENT_USER_ID,
      amount: product.price,
      status: 'PENDING',
      createdAt,
      confirmBy: plusHours(createdAt, SELLER_CONFIRM_HOURS),
      delivery: { ...delivery },
      paymentMethod: null,
      timeline: [{ status: 'PENDING', at: createdAt }],
    }
    product.status = 'RESERVED'
    orders.push(order)
    return withDetails(order)
  })
  return { orders: created, isSample: true }
}

// Buyer actions
const cancelOrder = (id) => transition(id, { from: ['PENDING', 'AWAITING_PAYMENT'], to: 'CANCELLED', actor: 'buyer' })
const payOrder = (id, method) => transition(id, { from: ['AWAITING_PAYMENT'], to: 'PAID', actor: 'buyer' }, { fields: { paymentMethod: method } })
const confirmReceived = (id) => transition(id, { from: ['DELIVERING'], to: 'COMPLETED', actor: 'buyer' })

// Seller actions
const confirmOrder = (id) => transition(id, { from: ['PENDING'], to: 'AWAITING_PAYMENT', actor: 'seller' })
const declineOrder = (id) => transition(id, { from: ['PENDING'], to: 'CANCELLED', actor: 'seller' })
const markDelivering = (id) => transition(id, { from: ['PAID'], to: 'DELIVERING', actor: 'seller' })

/** SAMPLE MODE ONLY: performs the other person's next step (seller confirms/delivers, buyer pays/receives). */
async function simulateOtherParty(id) {
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

export default { listOrders, getOrders, placeOrders, cancelOrder, payOrder, confirmReceived, confirmOrder, declineOrder, markDelivering, simulateOtherParty }
