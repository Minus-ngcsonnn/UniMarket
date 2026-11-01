/** SAMPLE VIOLATION REPORTS (development only). Target: a listing (UM-…) or a user. */
const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString()

export const SEED_REPORTS = [
  { id: 508, targetType: 'LISTING', targetId: 2045, reason: 'FAKE', details: 'The photos look like they come from an online shop, not the seller’s own shoes.', reporterId: 'u-thao', status: 'RESOLVED', createdAt: hoursAgo(30), resolution: 'Listing blocked: seller asked to upload own photos.' },
  { id: 507, targetType: 'USER', targetId: 'u-khoa', reason: 'OFF_PLATFORM_PAYMENT', details: 'Asked me to transfer money to his bank account before confirming the order.', reporterId: 'u-quan', status: 'RESOLVED', createdAt: hoursAgo(52), resolution: 'Account suspended for asking for payment outside UniMarket.' },
  { id: 506, targetType: 'LISTING', targetId: 2047, reason: 'MISLEADING', details: 'Says battery lasts 25 hours, I doubt it for a used pair.', reporterId: 'u-son', status: 'OPEN', createdAt: hoursAgo(5) },
  { id: 505, targetType: 'USER', targetId: 'u-anh', reason: 'HARASSMENT', details: 'Sent rude messages after I cancelled my order.', reporterId: 'u-vy', status: 'OPEN', createdAt: hoursAgo(9) },
  { id: 504, targetType: 'LISTING', targetId: 2046, reason: 'PROHIBITED', details: 'Are fridges allowed in the dormitory?', reporterId: 'u-ngoc', status: 'DISMISSED', createdAt: hoursAgo(70), resolution: 'Allowed item: small fridges are permitted in campus dormitories.' },
  { id: 503, targetType: 'LISTING', targetId: 2040, reason: 'SPAM', details: 'Same laptop seems to be listed twice.', reporterId: 'u-bao', status: 'OPEN', createdAt: hoursAgo(14) },
]
