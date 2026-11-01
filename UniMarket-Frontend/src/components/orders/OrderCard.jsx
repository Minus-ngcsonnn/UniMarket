import { Link } from 'react-router'
import { ORDER_STATUSES, PAYMENT_METHODS, orderCode } from '../../constants/order'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import { PATHS } from '../../routes/paths'
import { isSampleData } from '../../services/products/productService'
import { formatDateTime, formatPrice } from '../../utils/format'
import { ChevronDownIcon } from '../icons'
import { ConditionBadge } from '../product/ProductBadges'
import Button from '../ui/Button'
import ImageSlot from '../ui/ImageSlot'
import OrderProgress from './OrderProgress'
import OrderStatusBadge from './OrderStatusBadge'

/**
 * What happens next for this order and which actions this person can take (Business Plan flow).
 * @returns {{ text: string, actions: { key, label, variant }[] }}
 */
function nextStep(order, role) {
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
        return { text: `${seller} is delivering your item. Confirm once you have it.`, actions: [{ key: 'received', label: 'I’ve received it', variant: 'primary' }] }
      case 'COMPLETED':
        return { text: 'Completed. Thanks for buying on campus! Reviews are coming in a later version.', actions: [] }
      default:
        return { text: 'This order was cancelled. The listing is available again.', actions: [] }
    }
  }

  switch (order.status) {
    case 'PENDING':
      return {
        text: `${buyer} wants this item. Confirm by ${deadline}, or decline if it’s no longer available.`,
        actions: [
          { key: 'confirm', label: 'Confirm order', variant: 'primary' },
          { key: 'decline', label: 'Decline', variant: 'secondary' },
        ],
      }
    case 'AWAITING_PAYMENT':
      return { text: `Waiting for ${buyer} to pay online. Don’t accept payment outside UniMarket.`, actions: [] }
    case 'PAID':
      return { text: `${buyer} has paid. Deliver the item, then mark the order as delivering.`, actions: [{ key: 'ship', label: 'Mark as delivering', variant: 'primary' }] }
    case 'DELIVERING':
      return { text: `Waiting for ${buyer} to confirm they’ve received it.`, actions: [] }
    case 'COMPLETED':
      return { text: 'Completed. This listing is now marked as sold.', actions: [] }
    default:
      return { text: 'This order was cancelled. Your listing is available again.', actions: [] }
  }
}

/** Statuses where the *other* person acts next (sample mode lets you play their step). */
const OTHER_PARTY_TURN = { buyer: ['PENDING', 'PAID'], seller: ['AWAITING_PAYMENT', 'DELIVERING'] }

/**
 * One order in My orders, for the buyer ("Purchases") or the seller ("Sales").
 * @param {'buyer'|'seller'} role
 * @param {(order, actionKey) => void} onAction
 * @param {string|null} busyAction action currently running for this order
 */
export default function OrderCard({ order, role, onAction, busyAction }) {
  const { text, actions } = nextStep(order, role)
  const counterpart = role === 'buyer' ? order.seller : order.buyer
  const canSimulate = isSampleData && OTHER_PARTY_TURN[role].includes(order.status)
  const delivery = order.delivery ?? {}

  return (
    <article aria-labelledby={`order-${order.id}`} className="rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-muted">
          <span id={`order-${order.id}`} className="font-semibold text-ink">
            Order {orderCode(order.id)}
          </span>{' '}
          · {formatDateTime(order.createdAt)}
        </p>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex gap-3 sm:gap-4">
          <Link to={PATHS.product(order.productId)} className="block size-18 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
            <ImageSlot src={order.product?.image} alt="" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link to={PATHS.product(order.productId)} className="line-clamp-2 font-semibold text-ink hover:text-primary">
              {order.product?.title ?? 'Listing removed'}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {order.product && <ConditionBadge condition={order.product.condition} />}
              {role === 'buyer' ? 'Seller' : 'Buyer'}: {counterpart?.name}
            </div>
          </div>
          <p className="font-semibold whitespace-nowrap text-ink">{formatPrice(order.amount)}</p>
        </div>

        <OrderProgress status={order.status} />

        <div className="flex flex-col gap-3 rounded-control bg-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">{text}</p>
          {(actions.length > 0 || canSimulate) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.key}
                  size="sm"
                  variant={action.variant}
                  loading={busyAction === action.key}
                  disabled={Boolean(busyAction)}
                  onClick={() => onAction(order, action.key)}
                >
                  {action.label}
                </Button>
              ))}
              {canSimulate && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyAction === 'simulate'}
                  disabled={Boolean(busyAction)}
                  onClick={() => onAction(order, 'simulate')}
                  title="Sample data only: performs the other person’s next step"
                >
                  Simulate {role === 'buyer' ? 'seller' : 'buyer'} step
                  <span className="rounded bg-warning-soft px-1 text-[10px] font-semibold text-ink">DEMO</span>
                </Button>
              )}
            </div>
          )}
        </div>

        <details className="group text-sm">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
            Order details
            <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <dl className="flex flex-col gap-1.5">
              <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Delivery</dt>
              <dd className="text-ink">{delivery.fullName}</dd>
              <dd className="text-ink-muted">{delivery.phone}</dd>
              <dd className="text-ink-muted">
                {delivery.address} · {UNIVERSITY_NAME} {CAMPUSES[delivery.campus]?.label}
              </dd>
              {delivery.note && <dd className="text-ink-muted italic">“{delivery.note}”</dd>}
              <dt className="mt-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Payment</dt>
              <dd className="text-ink-muted">
                {order.paymentMethod ? `${PAYMENT_METHODS.find((m) => m.value === order.paymentMethod)?.label} (online)` : 'Not paid yet · online only'}
              </dd>
            </dl>
            <div>
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">History</p>
              <ol className="mt-1.5 flex flex-col gap-1.5">
                {order.timeline.map((event) => (
                  <li key={`${event.status}-${event.at}`} className="flex justify-between gap-3">
                    <span className="text-ink">{ORDER_STATUSES[event.status]?.label}</span>
                    <span className="text-xs text-ink-muted">{formatDateTime(event.at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </details>
      </div>
    </article>
  )
}
