import { useId, useState } from 'react'
import { orderCode } from '../../constants/order'
import { orderService } from '../../services/orders/orderService'
import { describeApiError } from '../../utils/apiErrorMessage'
import { formatDateTime, formatPrice } from '../../utils/format'
import { CheckCircleIcon, LockIcon, XIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import useTranslation from '../../i18n/useTranslation'

/** Providers accepted by POST /api/orders/{id}/payments (V003). All simulated: no provider is contacted. */
const SIMULATED_PROVIDERS = [
  { value: 'MOMO', label: 'MoMo (simulated)' },
  { value: 'ZALOPAY', label: 'ZaloPay (simulated)' },
  { value: 'BANK_QR', label: 'Bank QR (simulated)' },
]

const PAYMENT_ERRORS = {
  ORDER_DEADLINE_PASSED: 'The payment deadline has passed, so this order can no longer be paid.',
  ORDER_STATE_CONFLICT: 'This order has already moved on. Close this window to see its current status.',
  PAYMENT_IN_PROGRESS: 'Another payment attempt for this order is still in progress.',
  PAYMENT_TOO_LATE: 'The payment arrived after the deadline and was not accepted.',
  PAYMENT_CONFLICT: 'The payment result conflicts with an earlier one. Close this window to see the current status.',
}

const errorText = (error) => PAYMENT_ERRORS[error?.code] ?? describeApiError(error).message

/**
 * Online payment of one order with the real API (simulated, Stage 6.3):
 * 1. POST /api/orders/{id}/payments { provider } starts (or resumes) an attempt; the amount is the order total from the
 *    database. This does NOT mark the order paid.
 * 2. Sandbox only: the buyer chooses the simulated outcome; the backend simulator signs a provider-style notification
 *    (HMAC) that is verified and recorded by usp_RecordPaymentResult. Only then is the order PAID.
 * The simulator choice is shown only when the attempt has `simulatorUrl`; without it online payment is unavailable.
 * A Bank QR attempt shows the simulated payload as text — it is not a payable bank QR and names no bank account.
 */
export default function BackendPaymentDialog({ order, onClose }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [provider, setProvider] = useState(order.paymentMethod && SIMULATED_PROVIDERS.some((p) => p.value === order.paymentMethod) ? order.paymentMethod : 'MOMO')
  const [attempt, setAttempt] = useState(null)
  const [state, setState] = useState({ status: 'idle', error: null }) // idle | starting | started | completing | paid | failed | error

  async function start() {
    setState({ status: 'starting', error: null })
    try {
      const result = await orderService.startPayment(order.id, provider)
      setAttempt(result)
      setState({ status: 'started', error: null })
    } catch (error) {
      setState({ status: 'error', error: errorText(error) })
    }
  }

  async function complete(outcome) {
    setState({ status: 'completing', error: null })
    try {
      const updated = await orderService.completeSimulatedPayment(attempt.simulatorUrl, outcome)
      if (updated.status === 'PAID') setState({ status: 'paid', error: null })
      else {
        setAttempt(null)
        setState({ status: 'failed', error: null })
      }
    } catch (error) {
      setState({ status: 'error', error: errorText(error) })
    }
  }

  const amount = attempt?.amount ?? order.amount
  const busy = state.status === 'starting' || state.status === 'completing'

  return (
    <Modal onClose={busy ? () => {} : onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {t('Pay for order {code}', { code: order.code ?? orderCode(order.id) })}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {order.items.length === 1 ? order.items[0].title : t('{count} items', { count: order.items.length })} · {t('Seller {name}', { name: order.seller?.name })}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("Close")} className="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink disabled:opacity-50">
            <XIcon className="size-5" />
          </button>
        </div>

        {state.status === 'paid' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircleIcon className="size-6" />
            </span>
            <p className="font-semibold text-ink">{t('Simulated payment recorded')}</p>
            <p className="text-sm text-ink-muted">
              {t('The server verified the simulated payment and the order is now paid. {name} can arrange delivery. No real money was charged.', { name: order.seller?.name })}
            </p>
            <Button onClick={onClose} className="mt-2">
              {t("Done")}
            </Button>
          </div>
        ) : (
          <>
            <Alert variant="warning" title={t('Simulated payment')}>
              {t('Thanh toán mô phỏng: no payment provider is contacted and no money is charged or transferred.')}
            </Alert>

            <div className="flex items-center justify-between rounded-control bg-subtle px-4 py-3">
              <span className="text-sm text-ink-muted">{t("Amount")}</span>
              <span className="text-xl font-bold text-ink">{formatPrice(amount)}</span>
            </div>
            {order.paymentDueAt && <p className="-mt-3 text-xs text-ink-muted">{t('Pay by {time}.', { time: formatDateTime(order.paymentDueAt) })}</p>}

            {!attempt ? (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium text-ink">{t("Payment method")}</legend>
                  {SIMULATED_PROVIDERS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                        provider === option.value ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:border-ink-muted/40'
                      }`}
                    >
                      <input type="radio" name="payment-provider" value={option.value} checked={provider === option.value} onChange={() => setProvider(option.value)} className="accent-primary" />
                      <span className="flex-1 font-medium">{t(option.label)}</span>
                    </label>
                  ))}
                </fieldset>
                {state.status === 'failed' && (
                  <Alert variant="danger" title={t('Simulated payment failed')}>
                    {t('The order is still waiting for payment. You can try again.')}
                  </Alert>
                )}
                {state.status === 'error' && (
                  <Alert variant="danger" title={t('Payment not started')}>
                    {t(state.error)}
                  </Alert>
                )}
                <Button size="lg" fullWidth onClick={start} loading={state.status === 'starting'} disabled={busy}>
                  <LockIcon className="size-4" />
                  {t('Continue to simulated payment')}
                </Button>
              </>
            ) : (
              <>
                {attempt.resumed && (
                  <p className="text-sm text-ink-muted">{t('An earlier payment attempt for this order is still open, so it was resumed ({provider}).', { provider: attempt.provider })}</p>
                )}
                {attempt.bankQr && (
                  <div className="flex flex-col gap-2 rounded-control border border-dashed border-warning bg-warning-soft p-3">
                    <p className="text-xs font-semibold text-ink">{t('SIMULATED bank QR — not a real bank transfer. Do not transfer money.')}</p>
                    <code className="block overflow-x-auto rounded bg-surface p-2 text-[11px] break-all text-ink">{attempt.bankQr.qrPayload}</code>
                    <p className="text-xs text-ink-muted">{t('Reference {ref} · {amount}', { ref: attempt.bankQr.reference, amount: formatPrice(attempt.bankQr.amount) })}</p>
                  </div>
                )}
                {attempt.simulatorUrl ? (
                  <>
                    <p className="text-sm text-ink-muted">{t('Sandbox: choose the result the simulated provider reports. The server verifies it before the order changes.')}</p>
                    {state.status === 'error' && (
                      <Alert variant="danger" title={t('Payment not completed')}>
                        {t(state.error)}
                      </Alert>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button className="flex-1" onClick={() => complete('SUCCESS')} loading={state.status === 'completing'} disabled={busy}>
                        {t('Simulate successful payment')}
                      </Button>
                      <Button className="flex-1" variant="secondary" onClick={() => complete('FAILURE')} disabled={busy}>
                        {t('Simulate failed payment')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Alert variant="info" title={t('Online payment is unavailable')}>
                    {t('The payment simulator is turned off on this server and no real provider is connected.')}
                  </Alert>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
