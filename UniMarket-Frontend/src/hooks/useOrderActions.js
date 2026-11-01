import { useState } from 'react'
import { orderCode } from '../constants/order'
import { ORDER_ACTIONS, actionDoneMessage } from '../utils/orderFlow'

/**
 * State for running order actions with confirmation/payment dialogs and feedback.
 * Pages render <OrderActionDialogs {...dialogProps} /> and pass `handleAction` to buttons.
 * Order data refreshes automatically after each action (orderService notifies useLiveOrders).
 */
export default function useOrderActions() {
  const [busy, setBusy] = useState(null) // { orderId, action }
  const [dialog, setDialog] = useState(null) // { type: 'pay' | 'confirm' | 'review', order, action }
  const [feedback, setFeedback] = useState(null) // { variant, text }

  async function run(order, action) {
    setBusy({ orderId: order.id, action })
    setFeedback(null)
    try {
      await ORDER_ACTIONS[action].run(order.id)
      setFeedback({ variant: 'success', text: actionDoneMessage(order, action) })
    } catch (actionError) {
      setFeedback({ variant: 'danger', text: `${orderCode(order.id)}: ${actionError.message}` })
    } finally {
      setBusy(null)
      setDialog(null)
    }
  }

  function handleAction(order, action) {
    setFeedback(null)
    if (action === 'pay') setDialog({ type: 'pay', order })
    else if (action === 'review') setDialog({ type: 'review', order })
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
