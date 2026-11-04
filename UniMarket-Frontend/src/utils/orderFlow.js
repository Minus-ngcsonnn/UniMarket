import { orderService } from '../services/orders/orderService'
import { formatDateTime } from './format'

/**
 * Order actions of the Business Plan flow: who can do what, whether it needs confirmation, and the
 * message afterwards. Shared by My orders and Order detail so the rules live in one place.
 */
export const ORDER_ACTIONS = {
  cancel: {
    run: orderService.cancelOrder,
    done: 'Order cancelled. The items are available to other students again.',
    confirm: {
      title: 'Cancel this order?',
      message: 'The seller will be told and the items become available to other students again.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      tone: 'danger',
    },
  },
  decline: {
    run: orderService.declineOrder,
    done: 'Order declined. Your listings are available again.',
    confirm: {
      title: 'Decline this order?',
      message: 'The whole order is declined and the buyer is told. Your listings become available again.',
      confirmLabel: 'Decline order',
      cancelLabel: 'Go back',
      tone: 'danger',
    },
  },
  received: {
    run: orderService.confirmReceived,
    done: 'Order completed. Enjoy your new finds!',
    confirm: {
      title: 'Have you received everything?',
      message: 'Only confirm once you have all items in this order and they match the listings. This completes the order.',
      confirmLabel: 'Yes, I’ve received it',
      cancelLabel: 'Not yet',
      tone: 'primary',
    },
  },
  confirm: { run: orderService.confirmOrder, done: 'Order confirmed. The buyer can now pay online.' },
  // Real API: the chosen simulated carrier is recorded with the shipment (no real carrier is booked).
  ship: { run: (id, order) => orderService.markDelivering(id, { carrier: order?.shipping?.label }), done: 'Marked as delivering. The buyer will confirm when they receive it.' },
  simulate: { run: orderService.simulateOtherParty, done: 'Simulated the other person’s next step (sample data).' },
}

/** Statuses where the *other* person acts next (sample mode lets you play their step). */
export const OTHER_PARTY_TURN = { buyer: ['PENDING', 'PAID'], seller: ['AWAITING_PAYMENT', 'DELIVERING'] }

/**
 * What happens next for this order and which actions this person can take.
 * @param {'buyer'|'seller'} role
 * @returns {{ text: string, actions: { key, label, variant }[] }}
 */
export function nextStep(order, role) {
  const step = baseNextStep(order, role)
  if (!order.isBackend) return step
  const actions = allowedActions(order, role, step.actions)
  // Stage 6.4: a paid / delivering / completed order can be sent to an admin when the server allows it.
  if (order.actions.includes('OPEN_DISPUTE')) actions.push({ key: 'dispute', label: 'Report a problem', variant: 'ghost' })
  return { ...step, text: backendText(order, role) ?? step.text, actions }
}

/**
 * Real API: buttons only for what the server lists in `order.actions` (it checks again on every call). Reviews are
 * written in the Reviews section of the order page (it knows whether this side may still review).
 */
const BACKEND_ACTION = { confirm: 'CONFIRM', decline: 'CANCEL', cancel: 'CANCEL', pay: ['PAY', 'CONTINUE_PAYMENT'], ship: 'SHIP', received: 'CONFIRM_RECEIPT' }
function allowedActions(order, role, actions) {
  return actions
    .filter((action) => [].concat(BACKEND_ACTION[action.key] ?? []).some((code) => order.actions.includes(code)))
    .map((action) => (action.key === 'pay' && order.actions.includes('CONTINUE_PAYMENT') ? { ...action, label: 'Continue payment' } : action))
}

/** Real API: deadlines and reasons from the server. */
function backendText(order, role) {
  const seller = order.seller?.name ?? 'The seller'
  const buyer = order.buyer?.name ?? 'The buyer'
  if (order.status === 'AWAITING_PAYMENT' && order.paymentDueAt) {
    return role === 'buyer'
      ? `${seller} confirmed your order. Pay online (simulated) by ${formatDateTime(order.paymentDueAt)}, or it is cancelled automatically.`
      : `Waiting for ${buyer} to pay online by ${formatDateTime(order.paymentDueAt)}. Don’t accept payment outside UniMarket.`
  }
  if (order.status === 'PAID' && role === 'seller') {
    return `${buyer} has paid (simulated). Hand the order to delivery, then mark it as delivering.`
  }
  if (order.disputes?.some((d) => d.status === 'OPEN')) {
    return 'A problem was reported on this order. An admin is reviewing it; completion and the seller payout wait until it is resolved.'
  }
  if (order.status === 'COMPLETED') {
    return role === 'buyer' ? 'Completed. Thanks for buying on UniMarket! You can review the seller below.' : 'Completed. These listings are now marked as sold. You can review the buyer below.'
  }
  if (order.status === 'CANCELLED') {
    return order.cancellationReason ? `This order was cancelled: ${order.cancellationReason}` : 'This order was cancelled. The items are available again.'
  }
  return null
}

function baseNextStep(order, role) {
  const seller = order.seller?.name ?? 'The seller'
  const buyer = order.buyer?.name ?? 'The buyer'
  const deadline = formatDateTime(order.confirmBy)

  if (role === 'buyer') {
    switch (order.status) {
      case 'PENDING':
        return { text: `Waiting for ${seller} to confirm (by ${deadline}).`, actions: [{ key: 'cancel', label: 'Cancel order', variant: 'secondary' }] }
      case 'AWAITING_PAYMENT':
        return {
          text: `${seller} confirmed your order. Pay online to continue.`,
          actions: [
            { key: 'pay', label: 'Pay now', variant: 'primary' },
            { key: 'cancel', label: 'Cancel order', variant: 'secondary' },
          ],
        }
      case 'PAID':
        return { text: `Payment received. ${seller} is arranging delivery to you.`, actions: [] }
      case 'DELIVERING':
        return { text: `${seller} is delivering your order. Confirm once you have everything.`, actions: [{ key: 'received', label: 'I’ve received it', variant: 'primary' }] }
      case 'COMPLETED':
        return {
          text: `Completed. Thanks for buying on campus! Rate ${seller} to help other students.`,
          actions: [{ key: 'review', label: 'Review seller', variant: 'secondary' }],
        }
      default:
        return { text: 'This order was cancelled. The items are available again.', actions: [] }
    }
  }

  switch (order.status) {
    case 'PENDING':
      return {
        text: `${buyer} wants ${order.items.length > 1 ? 'these items' : 'this item'}. Confirm by ${deadline}, or decline if you can’t sell them.`,
        actions: [
          { key: 'confirm', label: 'Confirm order', variant: 'primary' },
          { key: 'decline', label: 'Decline', variant: 'secondary' },
        ],
      }
    case 'AWAITING_PAYMENT':
      return { text: `Waiting for ${buyer} to pay online. Don’t accept payment outside UniMarket.`, actions: [] }
    case 'PAID':
      return { text: `${buyer} has paid. Deliver the order, then mark it as delivering.`, actions: [{ key: 'ship', label: 'Mark as delivering', variant: 'primary' }] }
    case 'DELIVERING':
      return { text: `Waiting for ${buyer} to confirm they’ve received it.`, actions: [] }
    case 'COMPLETED':
      return {
        text: `Completed. These listings are now marked as sold. You can rate ${buyer} as a buyer.`,
        actions: [{ key: 'review', label: 'Review buyer', variant: 'secondary' }],
      }
    default:
      return { text: 'This order was cancelled. Your listings are available again.', actions: [] }
  }
}
