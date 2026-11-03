/**
 * SAMPLE IMPLEMENTATION of the admin API for frontend development.
 * Same function signatures as src/services/admin/adminApi.js.
 *
 * - Lists and counts are computed from the sample data (users, listings, orders, reviews, reports).
 * - Trends for the overview cards are ILLUSTRATIVE numbers for the layout, not measurements.
 * - Every admin action (approve, block, suspend, resolve…) is a PREVIEW: the input is checked, then
 *   it resolves with { saved: false } and NOTHING changes. Real moderation needs the backend, which
 *   must also check that the caller is an admin.
 */
import { CATEGORIES } from '../constants/categories'
import { LISTING_MODERATION_KEYS, REPORT_STATUSES } from '../constants/moderation'
import { ORDER_STATUSES } from '../constants/order'
import { sampleOrderRecords } from './mockOrderApi'
import { simulateNetwork } from './network'
import { MOCK_PRODUCTS } from './products'
import { SEED_REPORTS } from './reports'
import { SEED_REVIEWS } from './reviews'
import { applySavedProductStatuses, loadSampleReviews } from './sampleStore'
import { MOCK_ADMIN, MOCK_USERS } from './users'

const DEFAULT_PAGE_SIZE = 8
const MIN_REASON_LENGTH = 10

async function ready() {
  await simulateNetwork()
  applySavedProductStatuses(MOCK_PRODUCTS)
}

const includesText = (values, q) => !q || values.filter(Boolean).join(' ').toLowerCase().includes(q.trim().toLowerCase())
const inCampus = (value, campus) => !campus || value === campus
const byNewest = (key) => (a, b) => new Date(b[key]) - new Date(a[key])

function paginate(items, { page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  return { items: items.slice((current - 1) * pageSize, current * pageSize), total: items.length, page: current, pageSize }
}

function countBy(items, key, values) {
  return { all: items.length, ...Object.fromEntries(values.map((value) => [value, items.filter((item) => item[key] === value).length])) }
}

const students = () => Object.values(MOCK_USERS).filter((u) => u.role === 'STUDENT')
const reviews = () => [...SEED_REVIEWS, ...loadSampleReviews()]

function rating(userId) {
  const received = reviews().filter((r) => r.revieweeId === userId)
  return { average: received.length ? Math.round((received.reduce((s, r) => s + r.rating, 0) / received.length) * 10) / 10 : null, count: received.length }
}

const openReportsAbout = (type, id) => SEED_REPORTS.filter((r) => r.status === 'OPEN' && r.targetType === type && String(r.targetId) === String(id)).length

function listingRow(product) {
  return { ...product, seller: MOCK_USERS[product.sellerId], openReports: openReportsAbout('LISTING', product.id) }
}

function userRow(user) {
  return {
    ...user,
    listingCount: MOCK_PRODUCTS.filter((p) => p.sellerId === user.id).length,
    rating: rating(user.id),
    openReports: openReportsAbout('USER', user.id),
  }
}

function reportRow(report) {
  const product = report.targetType === 'LISTING' ? MOCK_PRODUCTS.find((p) => p.id === report.targetId) : null
  const user = report.targetType === 'USER' ? MOCK_USERS[report.targetId] : null
  return {
    ...report,
    target: product
      ? { type: 'LISTING', id: product.id, label: product.title, ownerName: MOCK_USERS[product.sellerId]?.name, moderation: product.moderation }
      : { type: 'USER', id: report.targetId, label: user?.name ?? 'Deleted account', status: user?.status },
    reporter: MOCK_USERS[report.reporterId],
  }
}

/** Overview cards (Figma: Total users, Active listings, Total orders, Total revenue → completed order value). */
async function getOverview({ campus } = {}) {
  await ready()
  const users = students().filter((u) => inCampus(u.campus, campus))
  const products = MOCK_PRODUCTS.filter((p) => inCampus(p.campus, campus))
  const completed = sampleOrderRecords().filter((o) => o.status === 'COMPLETED' && inCampus(o.delivery?.campus, campus))
  return {
    isSample: true,
    stats: {
      totalUsers: users.length,
      verifiedUsers: users.filter((u) => u.emailVerified).length, // email ownership only, not student status
      activeListings: products.filter((p) => p.moderation === 'APPROVED' && p.status === 'AVAILABLE').length,
      pendingListings: products.filter((p) => p.moderation === 'PENDING').length,
      completedOrders: completed.length,
      completedValue: completed.reduce((sum, o) => sum + o.amount, 0),
      openReports: SEED_REPORTS.filter((r) => r.status === 'OPEN').length,
    },
    // Illustrative 7-point shapes for the sparklines (no history exists in sample data).
    trends: {
      totalUsers: [6, 7, 7, 9, 11, 12, 15],
      activeListings: [3, 5, 4, 6, 5, 7, 6],
      completedOrders: [0, 1, 0, 1, 1, 0, 1],
      completedValue: [0, 2, 1, 3, 2, 3, 4],
    },
  }
}

/** Sidebar/top bar data: the signed-in admin and what needs attention. */
async function getBadgeCounts() {
  await ready()
  return {
    admin: { name: MOCK_ADMIN.name, title: `${MOCK_ADMIN.title} · sample` },
    pendingListings: MOCK_PRODUCTS.filter((p) => p.moderation === 'PENDING').length,
    openReports: SEED_REPORTS.filter((r) => r.status === 'OPEN').length,
  }
}

/** Listings for moderation. @param {{ q, moderation, category, campus, page, pageSize }} params */
async function listListings(params = {}) {
  await ready()
  const { q, moderation, category, campus, listed, sort } = params
  const since = Number(listed) > 0 ? Date.now() - Number(listed) * 86_400_000 : null
  const matching = MOCK_PRODUCTS.filter(
    (p) =>
      includesText([p.title, `UM-${p.id}`, MOCK_USERS[p.sellerId]?.name], q) &&
      (!category || p.categorySlug === category) &&
      inCampus(p.campus, campus) &&
      (!since || new Date(p.createdAt).getTime() >= since),
  )
  const sorters = {
    oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    price_desc: (a, b) => b.price - a.price,
    price_asc: (a, b) => a.price - b.price,
  }
  const rows = matching.filter((p) => !moderation || p.moderation === moderation).sort(sorters[sort] ?? byNewest('createdAt'))
  return { ...paginate(rows.map(listingRow), params), counts: countBy(matching, 'moderation', LISTING_MODERATION_KEYS) }
}

/** Student accounts. @param {{ q, status, verification, campus, page, pageSize }} params verification: VERIFIED | EMAIL | UNVERIFIED */
async function listUsers(params = {}) {
  await ready()
  const { q, status, verification, campus } = params
  const verificationOf = (u) => (u.emailVerified ? 'EMAIL' : 'UNVERIFIED')
  const matching = students().filter(
    (u) => includesText([u.name, u.email, u.programme], q) && inCampus(u.campus, campus) && (!verification || verificationOf(u) === verification),
  )
  const rows = matching.filter((u) => !status || u.status === status).sort(byNewest('memberSince'))
  return { ...paginate(rows.map(userRow), params), counts: countBy(matching, 'status', ['ACTIVE', 'SUSPENDED']) }
}

/** Violation reports. @param {{ q, status, targetType, page, pageSize }} params */
async function listReports(params = {}) {
  await ready()
  const { q, status, targetType } = params
  const matching = SEED_REPORTS.map(reportRow).filter(
    (r) => includesText([r.target.label, r.reporter?.name, `RP-${r.id}`, r.details], q) && (!targetType || r.targetType === targetType),
  )
  const rows = matching.filter((r) => !status || r.status === status).sort(byNewest('createdAt'))
  return { ...paginate(rows, params), counts: countBy(matching, 'status', Object.keys(REPORT_STATUSES)) }
}

/** Orders, read only. @param {{ q, status, campus, page, pageSize }} params */
async function listOrders(params = {}) {
  await ready()
  const { q, status, campus } = params
  const matching = sampleOrderRecords().filter(
    (o) => includesText([`UO-${o.id}`, o.buyer?.name, o.seller?.name, ...o.items.map((i) => i.title)], q) && inCampus(o.delivery?.campus, campus),
  )
  const rows = matching.filter((o) => !status || o.status === status).sort(byNewest('createdAt'))
  return { ...paginate(rows, params), counts: countBy(matching, 'status', Object.keys(ORDER_STATUSES)) }
}

/** Categories with listing counts, read only (categories are fixed in this version). */
async function listCategories({ campus } = {}) {
  await ready()
  const products = MOCK_PRODUCTS.filter((p) => inCampus(p.campus, campus))
  const items = CATEGORIES.map(({ slug, name, tagline }) => {
    const inCategory = products.filter((p) => p.categorySlug === slug)
    return {
      slug,
      name,
      tagline,
      total: inCategory.length,
      active: inCategory.filter((p) => p.moderation === 'APPROVED' && p.status === 'AVAILABLE').length,
      pending: inCategory.filter((p) => p.moderation === 'PENDING').length,
    }
  })
  return { items, total: items.length, page: 1, pageSize: items.length }
}

// ---- Actions: PREVIEW ONLY (checked, never applied) ----

function requireReason(reason, what) {
  if (!reason || reason.trim().length < MIN_REASON_LENGTH) throw new Error(`Explain the ${what} in at least ${MIN_REASON_LENGTH} characters.`)
}

function findListing(id) {
  const product = MOCK_PRODUCTS.find((p) => p.id === Number(id))
  if (!product) throw new Error('Listing not found.')
  return product
}

function findStudent(id) {
  const user = MOCK_USERS[id]
  if (!user || user.role !== 'STUDENT') throw new Error('Account not found.')
  return user
}

function findOpenReport(id) {
  const report = SEED_REPORTS.find((r) => r.id === Number(id))
  if (!report) throw new Error('Report not found.')
  if (report.status !== 'OPEN') throw new Error('This report has already been handled.')
  return report
}

const preview = async (check) => {
  await ready()
  check()
  return { saved: false }
}

export default {
  getOverview,
  getBadgeCounts,
  listListings,
  listUsers,
  listReports,
  listOrders,
  listCategories,
  approveListing: (id) =>
    preview(() => {
      if (findListing(id).moderation === 'APPROVED') throw new Error('This listing is already active.')
    }),
  removeListing: (id, reason) =>
    preview(() => {
      if (findListing(id).status === 'RESERVED') throw new Error('This listing is part of an open order. Wait until the order is completed or cancelled.')
      requireReason(reason, 'reason')
    }),
  blockListing: (id, reason) =>
    preview(() => {
      if (findListing(id).moderation === 'BLOCKED') throw new Error('This listing is already blocked.')
      requireReason(reason, 'reason')
    }),
  suspendUser: (id, reason) =>
    preview(() => {
      if (findStudent(id).status === 'SUSPENDED') throw new Error('This account is already suspended.')
      requireReason(reason, 'reason')
    }),
  reactivateUser: (id) =>
    preview(() => {
      if (findStudent(id).status === 'ACTIVE') throw new Error('This account is already active.')
    }),
  resolveReport: (id, resolution) =>
    preview(() => {
      findOpenReport(id)
      requireReason(resolution, 'action you took')
    }),
  dismissReport: (id, resolution) =>
    preview(() => {
      findOpenReport(id)
      requireReason(resolution, 'reason for dismissing')
    }),
  exportReport: () => preview(() => {}),
}
