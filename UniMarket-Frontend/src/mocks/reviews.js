/**
 * SAMPLE REVIEWS (development only). Each one belongs to a completed order between the two students.
 * Orders UO-29xx are historical sample orders that are not part of the demo order list.
 * `role` is the reviewer's side in that order: BUYER reviewed the seller, SELLER reviewed the buyer.
 */
import { MOCK_CURRENT_USER_ID } from './users'

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString()

export const SEED_REVIEWS = [
  { id: 701, orderId: 3001, reviewerId: 'u-linh', revieweeId: MOCK_CURRENT_USER_ID, role: 'BUYER', rating: 5, comment: 'Book exactly as described and delivered to the library on time. Thank you!', createdAt: daysAgo(2) },
  { id: 702, orderId: 2961, reviewerId: 'u-mai', revieweeId: MOCK_CURRENT_USER_ID, role: 'BUYER', rating: 4, comment: 'Lamp works well. Delivery was a day later than planned but the seller kept me updated.', createdAt: daysAgo(21) },
  { id: 703, orderId: 2958, reviewerId: 'u-huy', revieweeId: 'u-minh', role: 'BUYER', rating: 5, comment: 'Clean textbook, fair price, very quick to confirm.', createdAt: daysAgo(9) },
  { id: 704, orderId: 2949, reviewerId: 'u-duc', revieweeId: 'u-minh', role: 'BUYER', rating: 5, comment: 'Friendly and on time.', createdAt: daysAgo(16) },
  { id: 705, orderId: 2940, reviewerId: 'u-bao', revieweeId: 'u-minh', role: 'BUYER', rating: 4, comment: '', createdAt: daysAgo(30) },
  { id: 706, orderId: 2949, reviewerId: 'u-minh', revieweeId: 'u-duc', role: 'SELLER', rating: 5, comment: 'Paid quickly and was easy to deliver to.', createdAt: daysAgo(16) },
  { id: 707, orderId: 2952, reviewerId: 'u-thao', revieweeId: 'u-linh', role: 'BUYER', rating: 5, comment: 'Headphones in great condition, case included.', createdAt: daysAgo(12) },
  { id: 708, orderId: 2944, reviewerId: 'u-quan', revieweeId: 'u-linh', role: 'BUYER', rating: 3, comment: 'Item was fine but the battery life is shorter than described.', createdAt: daysAgo(25) },
  { id: 709, orderId: 2937, reviewerId: 'u-son', revieweeId: 'u-huy', role: 'BUYER', rating: 5, comment: 'Great backpack, exactly like the photos.', createdAt: daysAgo(40) },
]
