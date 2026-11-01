/**
 * SAMPLE IMPLEMENTATION of the account API (profiles, reviews, reports) for frontend development.
 * Same function signatures as src/services/account/accountApi.js.
 *
 * - Profiles: read from the sample users. Saving a profile is a PREVIEW: nothing is stored.
 * - Reviews: seed reviews + reviews written in this demo, which are kept in this browser only
 *   (localStorage, see sampleStore.js) and marked `isSample`. They are not real reviews.
 * - Reports: sending a report is a PREVIEW: nothing is stored and no admin is notified.
 *
 * The rules checked here (completed order, one review per side, 1–5 stars, max 500 characters) only
 * imitate what the backend must enforce later.
 */
import { REPORT_REASONS } from '../constants/moderation'
import { REVIEW_COMMENT_MAX } from '../constants/review'
import { sampleOrderRecords } from './mockOrderApi'
import { simulateNetwork } from './network'
import { MOCK_PRODUCTS } from './products'
import { SEED_REVIEWS } from './reviews'
import { loadSampleReviews, saveSampleReviews } from './sampleStore'
import { MOCK_CURRENT_USER_ID, MOCK_USERS } from './users'

const FIRST_SAMPLE_REVIEW_ID = 900

/** Public fields only: email and account details stay private. */
function publicUser(user) {
  if (!user) return null
  const { id, name, campus, programme, memberSince, bio, verified, status } = user
  return { id, name, campus, programme, memberSince, bio, verified, status }
}

function allReviews() {
  return [...SEED_REVIEWS, ...loadSampleReviews().map((review) => ({ ...review, isSample: true }))]
}

function withPeople(review) {
  return { ...review, reviewer: publicUser(MOCK_USERS[review.reviewerId]), reviewee: publicUser(MOCK_USERS[review.revieweeId]) }
}

/** Average, count and 1–5 star distribution of the reviews a student received. */
function ratingSummary(userId) {
  const received = allReviews().filter((r) => r.revieweeId === userId)
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  received.forEach((r) => {
    distribution[r.rating] += 1
  })
  const total = received.reduce((sum, r) => sum + r.rating, 0)
  return { average: received.length ? Math.round((total / received.length) * 10) / 10 : null, count: received.length, distribution }
}

function profileStats(userId) {
  const orders = sampleOrderRecords()
  return {
    activeListings: MOCK_PRODUCTS.filter((p) => p.sellerId === userId && p.status === 'AVAILABLE' && p.moderation === 'APPROVED').length,
    completedSales: orders.filter((o) => o.sellerId === userId && o.status === 'COMPLETED').length,
    completedPurchases: orders.filter((o) => o.buyerId === userId && o.status === 'COMPLETED').length,
  }
}

/** The signed-in student's own profile (includes private fields such as the email). */
async function getMyProfile() {
  await simulateNetwork()
  const user = MOCK_USERS[MOCK_CURRENT_USER_ID]
  return { ...user, rating: ratingSummary(user.id), stats: profileStats(user.id) }
}

/** A student's public profile, or null when the account does not exist. */
async function getUserProfile(userId) {
  await simulateNetwork()
  const user = MOCK_USERS[userId]
  if (!user) return null
  return { ...publicUser(user), rating: ratingSummary(user.id), stats: profileStats(user.id) }
}

/** PREVIEW: profile changes are checked but not stored. */
async function updateProfile() {
  await simulateNetwork()
  return { saved: false }
}

/**
 * Reviews a student received, newest first.
 * @param {string} userId
 * @param {{ role?: 'BUYER'|'SELLER' }} [filter] BUYER = written by buyers (about them as a seller)
 */
async function listUserReviews(userId, { role } = {}) {
  await simulateNetwork()
  return allReviews()
    .filter((r) => r.revieweeId === userId && (!role || r.role === role))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(withPeople)
}

async function getRatingSummary(userId) {
  await simulateNetwork()
  return ratingSummary(userId)
}

/**
 * Reviews of one order seen by the signed-in student.
 * @returns {Promise<{ canReview: boolean, mine: object|null, theirs: object|null }>}
 */
async function getOrderReviews(orderId) {
  await simulateNetwork()
  const order = sampleOrderRecords().find((o) => o.id === Number(orderId))
  if (!order || (order.buyerId !== MOCK_CURRENT_USER_ID && order.sellerId !== MOCK_CURRENT_USER_ID)) return { canReview: false, mine: null, theirs: null }
  const reviews = allReviews().filter((r) => r.orderId === order.id)
  const mine = reviews.find((r) => r.reviewerId === MOCK_CURRENT_USER_ID) ?? null
  const theirs = reviews.find((r) => r.revieweeId === MOCK_CURRENT_USER_ID) ?? null
  return { canReview: order.status === 'COMPLETED' && !mine, mine: mine && withPeople(mine), theirs: theirs && withPeople(theirs) }
}

/**
 * SAMPLE: saves the signed-in student's review of a completed order in this browser only.
 * @param {{ orderId: number, rating: number, comment?: string }} review
 * @returns {Promise<{ review: object, isSample: true }>}
 */
async function submitReview({ orderId, rating, comment = '' }) {
  await simulateNetwork()
  const order = sampleOrderRecords().find((o) => o.id === Number(orderId))
  if (!order) throw new Error('Order not found.')
  const role = order.buyerId === MOCK_CURRENT_USER_ID ? 'BUYER' : order.sellerId === MOCK_CURRENT_USER_ID ? 'SELLER' : null
  if (!role) throw new Error('You can only review orders you took part in.')
  if (order.status !== 'COMPLETED') throw new Error('You can review this order once it is completed.')
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Choose a rating from 1 to 5 stars.')
  const text = comment.trim()
  if (text.length > REVIEW_COMMENT_MAX) throw new Error(`Keep your review under ${REVIEW_COMMENT_MAX} characters.`)

  const saved = loadSampleReviews()
  if ([...SEED_REVIEWS, ...saved].some((r) => r.orderId === order.id && r.reviewerId === MOCK_CURRENT_USER_ID)) {
    throw new Error('You have already reviewed this order.')
  }
  const review = {
    id: saved.reduce((max, r) => Math.max(max, r.id), FIRST_SAMPLE_REVIEW_ID) + 1,
    orderId: order.id,
    reviewerId: MOCK_CURRENT_USER_ID,
    revieweeId: role === 'BUYER' ? order.sellerId : order.buyerId,
    role,
    rating,
    comment: text,
    createdAt: new Date().toISOString(),
  }
  saveSampleReviews([...saved, review])
  return { review: withPeople({ ...review, isSample: true }), isSample: true }
}

/** PREVIEW: the report is checked but not stored, and no admin is notified. */
async function createReport({ targetType, targetId, reason, details = '' }) {
  await simulateNetwork()
  if (!['LISTING', 'USER'].includes(targetType) || !targetId) throw new Error('Nothing to report.')
  if (!REPORT_REASONS.some((r) => r.value === reason)) throw new Error('Choose a reason.')
  if (targetType === 'USER' && targetId === MOCK_CURRENT_USER_ID) throw new Error('You can’t report yourself.')
  if (details.trim().length > 500) throw new Error('Keep the details under 500 characters.')
  return { saved: false }
}

export default {
  getMyProfile,
  getUserProfile,
  updateProfile,
  listUserReviews,
  getRatingSummary,
  getOrderReviews,
  submitReview,
  createReport,
}
