import { useEffect } from 'react'
import useAsyncData from '../../hooks/useAsyncData'
import { accountService, onReviewsChanged } from '../../services/account/accountService'
import Button from '../ui/Button'
import ErrorState from '../ui/ErrorState'
import ReviewCard from './ReviewCard'

/**
 * Reviews of a completed order on Order detail: the review the student wrote (or a button to write it)
 * and the review the other student wrote about them.
 * @param {() => void} onWriteReview opens the review dialog
 */
export default function OrderReviews({ order, onWriteReview }) {
  const { data, error, isLoading, reload } = useAsyncData(() => accountService.getOrderReviews(order.id), `order-reviews-${order.id}`)
  useEffect(() => onReviewsChanged(reload), [reload])

  const other = order.role === 'buyer' ? order.seller : order.buyer

  return (
    <section aria-labelledby="order-reviews-title" className="rounded-card border border-line bg-surface p-5">
      <h2 id="order-reviews-title" className="mb-4 text-base font-semibold text-ink">
        Reviews
      </h2>
      {error ? (
        <ErrorState title="Couldn’t load reviews" message={error.message} onRetry={reload} />
      ) : isLoading ? (
        <div className="h-24 animate-pulse rounded-card bg-subtle" aria-busy="true" aria-label="Loading reviews" />
      ) : (
        <div className="flex flex-col gap-3">
          {data.mine ? (
            <ReviewCard review={data.mine} showReviewee />
          ) : (
            data.canReview && (
              <div className="flex flex-col gap-3 rounded-control bg-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink">How was it with {other?.name}? Your review helps other students trade safely.</p>
                <Button size="sm" onClick={onWriteReview}>
                  {order.role === 'buyer' ? 'Review seller' : 'Review buyer'}
                </Button>
              </div>
            )
          )}
          {data.theirs ? (
            <ReviewCard review={data.theirs} />
          ) : (
            <p className="text-sm text-ink-muted">{other?.name ?? 'The other student'} hasn’t reviewed you for this order yet.</p>
          )}
        </div>
      )}
    </section>
  )
}
