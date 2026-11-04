import { useId, useState } from 'react'
import { orderService } from '../../services/orders/orderService'
import { describeApiError } from '../../utils/apiErrorMessage'
import { ScaleIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Textarea from '../ui/Textarea'
import useTranslation from '../../i18n/useTranslation'

const MIN = 10
const MAX = 2000
const ERRORS = {
  DISPUTE_NOT_ALLOWED: 'A problem can be reported only for paid, delivering or completed orders (and not after the seller was paid out).',
  ORDER_DISPUTED: 'This order already has an open dispute. An admin is reviewing it.',
}

/**
 * Buyer or seller of a PAID / DELIVERING / COMPLETED order asks an admin to review a problem
 * (POST /api/orders/{id}/disputes). Nothing is refunded automatically: an admin decides, and while the dispute is open
 * the buyer can't confirm receipt and the seller payout is on hold.
 */
export default function DisputeDialog({ order, onClose }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [state, setState] = useState({ status: 'idle', error: null })
  const tooShort = reason.trim().length < MIN

  async function submit(event) {
    event.preventDefault()
    setTouched(true)
    if (tooShort || state.status === 'sending') return
    setState({ status: 'sending', error: null })
    try {
      await orderService.openDispute(order.id, reason.trim())
      setState({ status: 'done', error: null })
    } catch (error) {
      setState({ status: 'idle', error: ERRORS[error?.code] ?? describeApiError(error).message })
    }
  }

  return (
    <Modal onClose={state.status === 'sending' ? () => {} : onClose} labelledBy={titleId}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5 p-6">
        <div className="flex gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <ScaleIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {t('Report a problem with order {code}', { code: order.code })}
            </h2>
            <p className="text-sm text-ink-muted">{t('An admin reviews it and decides. No refund is made automatically; payments in this version are simulated.')}</p>
          </div>
        </div>
        {state.status === 'done' ? (
          <Alert variant="success" title={t('Problem reported')}>
            {t('An admin will review it. You can follow the dispute on this order page.')}
          </Alert>
        ) : (
          <Textarea
            label={t('What went wrong?')}
            rows={4}
            maxLength={MAX}
            placeholder={t('e.g. The item arrived damaged; photos attached in the chat are not possible, so describe it here.')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            error={touched && tooShort ? t('Write at least {count} characters.', { count: MIN }) : undefined}
          />
        )}
        {state.error && (
          <Alert variant="danger" title={t('Not sent')}>
            {t(state.error)}
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={state.status === 'sending'}>
            {state.status === 'done' ? t('Close') : t('Cancel')}
          </Button>
          {state.status !== 'done' && (
            <Button type="submit" loading={state.status === 'sending'}>
              {t('Send to an admin')}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
