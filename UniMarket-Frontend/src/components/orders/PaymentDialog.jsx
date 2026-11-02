import { useId, useState } from 'react'
import { orderCode, PAYMENT_METHODS } from '../../constants/order'
import { orderService } from '../../services/orders/orderService'
import { formatPrice } from '../../utils/format'
import { CheckCircleIcon, LockIcon, XIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import useTranslation from '../../i18n/useTranslation'

/**
 * Online payment for one order (Business Plan: the buyer pays on the website after the seller confirms).
 * DEMO: payment is simulated. No payment provider is contacted and no money is charged; the dialog says so.
 *
 * @param {object} order the order to pay (status AWAITING_PAYMENT)
 * @param {() => void} onClose
 * @param {() => void} onPaid called after a successful (simulated) payment
 */
export default function PaymentDialog({ order, onClose, onPaid }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [method, setMethod] = useState(PAYMENT_METHODS[0].value)
  const [state, setState] = useState({ status: 'idle', error: null }) // idle | paying | paid | failed

  async function pay() {
    setState({ status: 'paying', error: null })
    try {
      await orderService.payOrder(order.id, method)
      setState({ status: 'paid', error: null })
      onPaid()
    } catch (payError) {
      setState({ status: 'failed', error: payError.message })
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {t('Pay for order {code}', { code: orderCode(order.id) })}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {order.items.length === 1 ? order.items[0].title : t('{count} items', { count: order.items.length })} · {t('Seller {name}', { name: order.seller?.name })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink">
            <XIcon className="size-5" />
          </button>
        </div>

        {state.status === 'paid' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircleIcon className="size-6" />
            </span>
            <p className="font-semibold text-ink">{t("Payment simulated")}</p>
            <p className="text-sm text-ink-muted">
              {t('The order is now marked as paid and {name} can arrange delivery. No real money was charged.', { name: order.seller?.name })}
            </p>
            <Button onClick={onClose} className="mt-2">
              {t("Done")}
            </Button>
          </div>
        ) : (
          <>
            <Alert variant="warning" title={t("Demo payment: simulated")}>
              {t("This is a demo. No payment provider is contacted and no money is charged.")}
            </Alert>

            <div className="flex items-center justify-between rounded-control bg-subtle px-4 py-3">
              <span className="text-sm text-ink-muted">{t("Amount")}</span>
              <span className="text-xl font-bold text-ink">{formatPrice(order.amount)}</span>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-ink">{t("Payment method")}</legend>
              {PAYMENT_METHODS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                    method === option.value ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:border-ink-muted/40'
                  }`}
                >
                  <input type="radio" name="payment-method" value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} className="accent-primary" />
                  <span className="flex-1 font-medium">{t(option.label)}</span>
                  <span className="text-[11px] text-ink-muted">{t("Demo")}</span>
                </label>
              ))}
            </fieldset>

            {state.status === 'failed' && (
              <Alert variant="danger" title={t("Payment failed")}>
                {state.error}
              </Alert>
            )}

            <Button size="lg" fullWidth onClick={pay} loading={state.status === 'paying'}>
              <LockIcon className="size-4" />
              {t('Pay {amount}', { amount: formatPrice(order.amount) })}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
