import { Link } from 'react-router'
import { orderCode } from '../../constants/order'
import { PATHS } from '../../routes/paths'
import { isSampleOrders } from '../../services/orders/orderService'
import { formatDateTime, formatPrice } from '../../utils/format'
import { OTHER_PARTY_TURN, nextStep } from '../../utils/orderFlow'
import { ArrowRightIcon } from '../icons'
import OrderItemList from './OrderItemList'
import OrderNextStep from './OrderNextStep'
import OrderProgress from './OrderProgress'
import OrderStatusBadge from './OrderStatusBadge'
import useTranslation from '../../i18n/useTranslation'

/**
 * One order in My orders (buyer "Purchases" or seller "Sales"): items, progress, next step and actions,
 * with a link to the full Order detail page.
 * @param {'buyer'|'seller'} role
 * @param {(order, actionKey) => void} onAction
 * @param {string|null} busyAction action currently running for this order
 */
export default function OrderCard({ order, role, onAction, busyAction }) {
  const { t } = useTranslation()
  const counterpart = role === 'buyer' ? order.seller : order.buyer

  return (
    <article aria-labelledby={`order-${order.id}`} className="rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-muted">
          <span id={`order-${order.id}`} className="font-semibold text-ink">
            {t('Order {code}', { code: order.code ?? orderCode(order.id) })}
          </span>{' '}
          · {formatDateTime(order.createdAt)} · {role === 'buyer' ? t('Seller') : t('Buyer')}: {counterpart?.name}
        </p>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <OrderItemList items={order.items} />
        <div className="flex justify-between border-t border-line pt-3 text-sm">
          <span className="text-ink-muted">
            {t(order.items.length === 1 ? '{count} item' : '{count} items', { count: order.items.length })} · {t('Total')}
          </span>
          <span className="font-semibold text-ink">{formatPrice(order.amount)}</span>
        </div>

        <OrderProgress status={order.status} />

        <OrderNextStep
          step={nextStep(order, role)}
          canSimulate={isSampleOrders && OTHER_PARTY_TURN[role].includes(order.status)}
          otherParty={role === 'buyer' ? 'seller' : 'buyer'}
          busyAction={busyAction}
          onAction={(action) => onAction(order, action)}
        />

        <Link to={PATHS.order(order.id)} className="group inline-flex min-h-6 w-fit items-center gap-1 py-1 text-sm font-semibold text-primary">
          {t("View order details")}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  )
}
