/**
 * Backend review / rating / public-profile JSON (docs/ADMIN_API.md §4) → the shapes of the review and profile
 * components (same fields as src/mocks/mockAccountApi.js). Plain functions, no browser APIs.
 */

/** Review JSON → { id, orderId, rating, comment, createdAt, role (who wrote it: BUYER | SELLER), reviewer, reviewee }. */
export function toReview(review) {
  if (!review) return null
  return {
    id: review.id,
    orderId: review.orderId,
    rating: review.rating,
    comment: review.comment ?? '',
    createdAt: review.createdAt,
    role: review.direction === 'SELLER_TO_BUYER' ? 'SELLER' : 'BUYER',
    reviewer: review.reviewer ? { id: review.reviewer.id, name: review.reviewer.fullName } : null,
    reviewee: review.reviewee ? { id: review.reviewee.id, name: review.reviewee.fullName } : null,
  }
}

/** Rating summary → { average, count, distribution { 1..5 }, asSeller, asBuyer } (hidden reviews excluded server-side). */
export function toRating(rating) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  Object.entries(rating?.distribution ?? {}).forEach(([stars, count]) => {
    distribution[stars] = count
  })
  return {
    average: rating?.average != null && rating.count > 0 ? Number(rating.average) : null,
    count: rating?.count ?? 0,
    distribution,
    asSeller: rating?.asSeller ?? 0,
    asBuyer: rating?.asBuyer ?? 0,
  }
}

/** Public profile → the profile shape of ProfileCard (same fields as services/auth/viewerProfile.js). */
export function toPublicProfile(profile) {
  return {
    id: profile.id,
    name: profile.fullName,
    emailVerified: Boolean(profile.emailVerified),
    memberSince: profile.memberSince,
    universityName: profile.university ?? null,
    campusName: profile.campus ?? null,
    affiliationSource: profile.affiliationSource ?? (profile.campusId ? 'OFFICIAL_CAMPUS' : 'NONE'),
    contact: profile.contact ?? null,
    programme: null,
    rating: toRating(profile.rating),
    stats: { activeListings: profile.activeListings ?? null, completedSales: null, completedPurchases: null },
    isBackendUser: true,
  }
}
