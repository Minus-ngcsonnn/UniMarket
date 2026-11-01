import { useEffect, useState } from 'react'
import useAsyncData from '../../hooks/useAsyncData'
import { accountService, onReviewsChanged } from '../../services/account/accountService'
import { StarIcon } from '../icons'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import FilterTabs from '../ui/FilterTabs'
import RatingSummary from './RatingSummary'
import ReviewCard from './ReviewCard'

const PAGE_SIZE = 5
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'BUYER', label: 'From buyers' },
  { value: 'SELLER', label: 'From sellers' },
]

/**
 * Reviews a student received: rating summary, filter (as a seller / as a buyer) and the list,
 * with loading, empty and error states.
 * @param {{ average, count, distribution }} rating summary shown above the list
 * @param {string} [emptyText] message when there are no reviews yet
 */
export default function ReviewList({ userId, rating, emptyText = 'Reviews appear here after completed orders.' }) {
  const [role, setRole] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const { data, previousData, error, isLoading, reload } = useAsyncData(() => accountService.listUserReviews(userId, { role: role || undefined }), `reviews-${userId}-${role}`)
  useEffect(() => onReviewsChanged(reload), [reload])
  const reviews = data ?? previousData ?? []

  function changeFilter(value) {
    setRole(value)
    setVisible(PAGE_SIZE)
  }

  let list
  if (error) {
    list = <ErrorState title="Couldn’t load reviews" message={error.message} onRetry={reload} />
  } else if (isLoading && !previousData) {
    list = (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading reviews">
        {[1, 2].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-card bg-subtle" />
        ))}
      </div>
    )
  } else if (reviews.length === 0) {
    list = (
      <EmptyState
        icon={<StarIcon className="size-6" />}
        title={role ? 'No reviews of this kind yet' : 'No reviews yet'}
        description={emptyText}
        className="py-8"
      />
    )
  } else {
    list = (
      <div className={`flex flex-col gap-3 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
        {reviews.slice(0, visible).map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
        {reviews.length > visible && (
          <Button variant="secondary" className="self-center" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
            Show more reviews ({reviews.length - visible})
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {rating && rating.count > 0 && <RatingSummary rating={rating} className="rounded-card border border-line bg-surface p-5" />}
      {rating?.count > 0 && <FilterTabs label="Filter reviews" options={FILTERS} value={role} onChange={changeFilter} />}
      <div aria-live="polite">{list}</div>
    </div>
  )
}
