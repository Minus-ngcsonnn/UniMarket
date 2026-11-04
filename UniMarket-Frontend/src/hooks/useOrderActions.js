import { useState } from 'react'
import { orderCode } from '../constants/order'
import useTranslation from '../i18n/useTranslation'
import { describeApiError } from '../utils/apiErrorMessage'
import { ORDER_ACTIONS } from '../utils/orderFlow'

/** Backend refusals of order actions (docs/ORDERS_API.md) → what the person can understand. */
const ORDER_ERRORS = {
  ORDER_STATE_CONFLICT: 'This order has already moved on. The page was refreshed.',
  ORDER_DEADLINE_PASSED: 'The deadline for this step has passed.',
  PAYMENT_IN_PROGRESS: 'A payment for this order is still in progress, so it can’t be cancelled now.',
  ORDER_DISPUTED: 'This order has an open dispute. An admin must resolve it first.',
  ACCESS_DENIED: 'You can’t do this for this order.',
}
const orderErrorText = (error) => ORDER_ERRORS[error?.code] ?? describeApiError(error).message

/**
 * State for running order actions with confirmation/payment dialogs and feedback.
 * Pages render <OrderActionDialogs {...dialogProps} /> and pass `handleAction` to buttons.
 * Order data refreshes automatically after each action (orderService notifies useLiveOrders).
 */
export default function useOrderActions() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(null) // { orderId, action }
  const [dialog, setDialog] = useState(null) // { type: 'pay' | 'confirm' | 'review', order, action }
  const [feedback, setFeedback] = useState(null) // { variant, text }

  async function run(order, action) {
    setBusy({ orderId: order.id, action })
    setFeedback(null)
    try {
      await ORDER_ACTIONS[action].run(order.id, order)
      setFeedback({ variant: 'success', text: `${order.code ?? orderCode(order.id)}: ${t(ORDER_ACTIONS[action].done)}` })
    } catch (actionError) {
      setFeedback({ variant: 'danger', text: `${order.code ?? orderCode(order.id)}: ${t(orderErrorText(actionError))}` })
    } finally {
      setBusy(null)
      setDialog(null)
    }
  }

  function handleAction(order, action) {
    setFeedback(null)
    if (action === 'pay') setDialog({ type: 'pay', order })
    else if (action === 'review') setDialog({ type: 'review', order })
    else if (action === 'dispute') setDialog({ type: 'dispute', order })
    else if (ORDER_ACTIONS[action].confirm) setDialog({ type: 'confirm', order, action })
    else run(order, action)
  }

  return {
    handleAction,
    busyActionFor: (order) => (busy?.orderId === order.id ? busy.action : null),
    feedback,
    clearFeedback: () => setFeedback(null),
    dialogProps: { dialog, isWorking: Boolean(busy), onRun: run, onClose: () => setDialog(null) },
  }
}
