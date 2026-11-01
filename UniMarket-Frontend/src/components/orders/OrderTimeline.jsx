import { ORDER_STATUSES, ORDER_STEPS } from '../../constants/order'
import { formatDateTime } from '../../utils/format'
import { CheckIcon, XIcon } from '../icons'

const STEP_TEXT = {
  PENDING: 'Order request sent to the seller.',
  AWAITING_PAYMENT: 'Seller confirmed. Waiting for online payment.',
  PAID: 'Paid online through UniMarket.',
  DELIVERING: 'Seller is delivering the order.',
  COMPLETED: 'Buyer confirmed receipt. Order complete.',
  CANCELLED: 'Order cancelled. Items are available again.',
}

/**
 * Vertical status history with times (delivery tracking on Order detail).
 * Shows every step of the Business Plan path; steps not reached yet are greyed out.
 */
export default function OrderTimeline({ order }) {
  const reached = new Map(order.timeline.map((event) => [event.status, event.at]))
  const isCancelled = order.status === 'CANCELLED'
  const steps = isCancelled
    ? [...order.timeline.map((event) => event.status)]
    : ORDER_STEPS.map((step) => step.status)

  return (
    <ol className="flex flex-col">
      {steps.map((status, index) => {
        const at = reached.get(status)
        const isCurrent = status === order.status
        const isDone = Boolean(at) && !isCurrent
        const isLast = index === steps.length - 1
        const label = status === 'COMPLETED' ? 'Received' : ORDER_STEPS.find((s) => s.status === status)?.label ?? ORDER_STATUSES[status]?.label
        return (
          <li key={status} aria-current={isCurrent ? 'step' : undefined} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <span aria-hidden="true" className={`absolute top-6 bottom-0 left-[11px] w-0.5 ${isDone ? 'bg-primary' : 'bg-line'}`} />}
            <span
              className={`relative flex size-6 shrink-0 items-center justify-center rounded-full ${
                status === 'CANCELLED'
                  ? 'bg-subtle text-ink-muted'
                  : isDone || (isCurrent && status === 'COMPLETED')
                    ? 'bg-primary text-white'
                    : isCurrent
                      ? 'bg-primary-soft text-primary ring-2 ring-primary'
                      : 'border-2 border-line bg-surface'
              }`}
            >
              {status === 'CANCELLED' ? <XIcon className="size-3.5" /> : (isDone || status === 'COMPLETED') && at ? <CheckIcon className="size-3.5" /> : null}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm font-medium ${at ? 'text-ink' : 'text-ink-muted'}`}>{label}</p>
              <p className="text-xs text-ink-muted">{at ? `${formatDateTime(at)} · ${STEP_TEXT[status]}` : 'Not yet'}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
