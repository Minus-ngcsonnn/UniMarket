import { useId, useState } from 'react'
import { orderCode } from '../../constants/order'
import { REVIEW_COMMENT_MAX } from '../../constants/review'
import useAsyncData from '../../hooks/useAsyncData'
import useForm from '../../hooks/useForm'
import { accountService } from '../../services/account/accountService'
import { isSampleData } from '../../services/products/productService'
import { validateReview } from '../../utils/reviewValidation'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import ErrorState from '../ui/ErrorState'
import LoadingState from '../ui/LoadingState'
import Modal from '../ui/Modal'
import Textarea from '../ui/Textarea'
import RatingInput from './RatingInput'
import ReviewCard from './ReviewCard'
import useTranslation from '../../i18n/useTranslation'

/**
 * Review the other student of a completed order (buyer → seller, seller → buyer).
 * Rules (src/constants/review.js): completed orders only, one review per side, 1–5 stars required,
 * optional comment up to 500 characters, not editable afterwards.
 */
export default function ReviewDialog({ order, onClose }) {
  const { t } = useTranslation()
  const titleId = useId()
  const { data, error, isLoading, reload } = useAsyncData(() => accountService.getOrderReviews(order.id), `order-reviews-${order.id}`)
  const [submitted, setSubmitted] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const isBuyer = order.role === 'buyer'
  const other = isBuyer ? order.seller : order.buyer

  const form = useForm({
    initialValues: { rating: 0, comment: '' },
    validate: validateReview,
    onSubmit: async (values) => {
      setSubmitError(null)
      try {
        const result = await accountService.submitReview({ orderId: order.id, rating: values.rating, comment: values.comment })
        setSubmitted(result.review)
      } catch (submitFailure) {
        setSubmitError(submitFailure.message)
      }
    },
  })

  let body
  if (error) {
    body = <ErrorState title={t("Couldn’t load reviews")} message={error.message} onRetry={reload} />
  } else if (isLoading) {
    body = <LoadingState message={t("Loading reviews…")} />
  } else if (submitted || data.mine) {
    const review = submitted ?? data.mine
    body = (
      <div className="flex flex-col gap-3">
        {submitted && (
          <Alert variant="success" title={t("Thanks for your review")}>
            {isSampleData || submitted.isSample
              ? 'Sample data: your review is saved in this browser only and is not visible to other students.'
              : 'Your review is now on their profile.'}
          </Alert>
        )}
        <ReviewCard review={review} showReviewee />
        <p className="text-xs text-ink-muted">{t("Reviews can’t be edited after they are submitted.")}</p>
      </div>
    )
  } else if (!data.canReview) {
    body = (
      <Alert variant="info" title={t("This order can’t be reviewed yet")}>
        {t("You can leave a review once the order is completed.")}
      </Alert>
    )
  } else {
    body = (
      <form id={`${titleId}-form`} noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
        <RatingInput value={form.values.rating} onChange={(value) => form.setFieldValue('rating', value)} error={form.touched.rating ? form.errors.rating : undefined} />
        <Textarea
          label={t("Comment (optional)")}
          placeholder={isBuyer ? 'Was the item as described? Was delivery on time?' : 'Did they pay quickly? Was delivery easy to arrange?'}
          rows={4}
          maxLength={REVIEW_COMMENT_MAX}
          hint={t("Be fair and specific. Don’t include phone numbers or personal details.")}
          {...form.getFieldProps('comment')}
        />
        {submitError && <Alert variant="danger">{submitError}</Alert>}
      </form>
    )
  }

  const showForm = !error && !isLoading && !submitted && !data.mine && data.canReview

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {isBuyer ? 'Review the seller' : 'Review the buyer'}
          </h2>
          <p className="text-sm text-ink-muted">
            {other?.name} · {t('Order {code}', { code: orderCode(order.id) })}
          </p>
        </div>

        {body}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {showForm ? 'Cancel' : 'Close'}
          </Button>
          {showForm && (
            <Button type="submit" form={`${titleId}-form`} loading={form.isSubmitting}>
              {t("Submit review")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
