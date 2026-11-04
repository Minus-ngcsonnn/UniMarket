import { Link, useParams } from 'react-router'
import { BadgeCheckIcon, MapPinIcon, ShieldCheckIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import OrderActionDialogs from '../../components/orders/OrderActionDialogs'
import OrderItemList from '../../components/orders/OrderItemList'
import OrderNextStep from '../../components/orders/OrderNextStep'
import OrderProgress from '../../components/orders/OrderProgress'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import OrderTimeline from '../../components/orders/OrderTimeline'
import OrderReviews from '../../components/reviews/OrderReviews'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Alert from '../../components/ui/Alert'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import LoadingState from '../../components/ui/LoadingState'
import { LEGACY_SETTLEMENT, LEGACY_SETTLEMENT_NOTE, PAYMENT_METHODS, orderCode } from '../../constants/order'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import useLiveOrders from '../../hooks/useLiveOrders'
import useOrderActions from '../../hooks/useOrderActions'
import { PATHS } from '../../routes/paths'
import { orderService } from '../../services/orders/orderService'
import { isSampleOrders } from '../../services/orders/orderService'
import { describeApiError } from '../../utils/apiErrorMessage'
import { formatDateTime, formatPrice } from '../../utils/format'
import Avatar from '../../components/ui/Avatar'
import { OTHER_PARTY_TURN, nextStep } from '../../utils/orderFlow'
import useTranslation from '../../i18n/useTranslation'

const DECISIONS = { NO_REFUND: 'Closed without refund', REFUND_APPROVED: 'Refund approved (recorded by an admin; simulated payments have no real money)' }

/** Disputes of this order (both sides see them; the opener's text is plain text). */
function OrderDisputes({ disputes }) {
  const { t } = useTranslation()
  return (
    <Card title="Disputes">
      <ul className="flex flex-col gap-3 text-sm">
        {disputes.map((d) => (
          <li key={d.id} className="rounded-control bg-subtle px-3 py-2">
            <p className="font-medium text-ink">
              {t(d.status === 'OPEN' ? 'Under review by an admin' : 'Resolved')} · {t('opened by the {side}', { side: t((d.openedBy ?? '').toLowerCase()) })} ·{' '}
              {formatDateTime(d.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-line text-ink-muted">{d.reason}</p>
            {d.decision && <p className="mt-1 text-ink">{t(DECISIONS[d.decision] ?? d.decision)}</p>}
            {d.resolution && <p className="mt-0.5 whitespace-pre-line text-ink-muted">{d.resolution}</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const PROVIDER_LABELS = { MOMO: 'MoMo (simulated)', ZALOPAY: 'ZaloPay (simulated)', BANK_QR: 'Bank QR (simulated)' }
const PAYMENT_STATUS = { PENDING: 'In progress', SUCCEEDED: 'Succeeded', FAILED: 'Failed', EXPIRED: 'Expired' }

/** Real API: amounts from the server (snapshots); the seller also sees commission and payout (3 % of items only). */
function BackendSummary({ order }) {
  const { t } = useTranslation()
  const { amounts, shipping } = order
  const legacySettlement = order.settlement?.calculation === LEGACY_SETTLEMENT
  const shippingLabel =
    shipping?.source === 'LEGACY'
      ? t('Delivery (earlier order)')
      : shipping?.label
        ? `${t(shipping.label)}${shipping.distanceKm != null ? ` · ${t('about {km} km', { km: Number(shipping.distanceKm) })}` : ''}`
        : t('Simulated delivery')
  const row = (label, value, strong = false) => (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`text-right ${strong ? 'font-semibold' : ''} text-ink`}>{value}</dd>
    </div>
  )
  return (
    <Card title="Summary">
      <dl className="flex flex-col gap-2 text-sm">
        {row(t('Items ({count})', { count: order.items.length }), formatPrice(amounts.subtotal))}
        {row(shippingLabel, amounts.shippingFee === 0 ? t('Free') : formatPrice(amounts.shippingFee))}
        {row(t('Payment'), order.paymentMethod ? t(PROVIDER_LABELS[order.paymentMethod] ?? order.paymentMethod) : t('Online, after confirmation'))}
        <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
          <dt className="font-semibold text-ink">{order.role === 'buyer' ? t('You pay') : t('Buyer pays')}</dt>
          <dd className="text-2xl font-bold tracking-tight text-ink">{formatPrice(amounts.total)}</dd>
        </div>
        {amounts.commission != null && (
          <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
            {row(t('UniMarket fee ({percent}% of items)', { percent: Math.round(Number(amounts.commissionRate ?? 0.03) * 100) }), `−${formatPrice(amounts.commission)}`)}
            {row(legacySettlement ? t('Delivery fee (not paid out in this legacy record)') : t('Delivery fee (passed to you)'), formatPrice(amounts.shippingFee))}
            {/* A legacy V001 settlement is kept exactly as recorded (merchandise only): show what was really recorded. */}
            {row(t('Your payout'), formatPrice(legacySettlement ? order.settlement.amount : amounts.sellerPayout), true)}
            {order.settlement && (
              <p className="text-xs text-ink-muted">
                {t(order.settlement.status === 'RELEASED' ? 'Payout recorded by an admin.' : 'Payout pending: an admin records it after completion.')}{' '}
                {order.settlement.sandbox && t('Simulated: no real money is paid out.')}
              </p>
            )}
            {legacySettlement && <p className="text-xs text-ink-muted">{t(LEGACY_SETTLEMENT_NOTE)}</p>}
          </div>
        )}
      </dl>
      {shipping?.source === 'SIMULATED_QUOTE' && <p className="mt-3 text-xs text-ink-muted">{t('Vận chuyển mô phỏng: no real carrier is booked.')}</p>}
      {order.payments?.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('Payment attempts')}</p>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            {order.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-2">
                <span>
                  {t(PROVIDER_LABELS[payment.provider] ?? payment.provider)} · {formatDateTime(payment.createdAt)}
                </span>
                <span className="font-medium text-ink">
                  {t(PAYMENT_STATUS[payment.status] ?? payment.status)}
                  {payment.sandbox ? ` · ${t('simulated')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

/**
 * Real API: delivery details as the server returns them. The seller gets them only while PAID / DELIVERING (privacy
 * rule); before that the card says when they appear.
 */
function BackendDelivery({ order }) {
  const { t } = useTranslation()
  const { delivery, shipment, shipping } = order
  return (
    <Card title="Deliver to">
      {delivery ? (
        <p className="flex gap-2 text-sm">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="block font-medium text-ink">{delivery.fullName}</span>
            <span className="block text-ink-muted">{delivery.phone}</span>
            <span className="block text-ink-muted">{delivery.address}</span>
            {shipping?.deliveryZone && (
              <span className="block text-ink-muted">
                {shipping.deliveryZone.name}, {shipping.deliveryZone.province}
              </span>
            )}
          </span>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          {t(
            order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT'
              ? 'The buyer’s delivery details appear here after they have paid.'
              : 'Delivery details are only shown while the order is being delivered.',
          )}
        </p>
      )}
      {shipment && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
          {t('Handed to {carrier} on {time}.', { carrier: t(shipment.carrier ?? shipping?.label ?? 'delivery'), time: formatDateTime(shipment.shippedAt) })}
          {shipment.trackingNumber && ` ${t('Tracking: {number}', { number: shipment.trackingNumber })}`}
        </p>
      )}
    </Card>
  )
}

function Card({ title, children, className = '' }) {
  const { t } = useTranslation()
  return (
    <section className={`rounded-card border border-line bg-surface p-5 ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold text-ink">{t(title)}</h2>}
      {children}
    </section>
  )
}

/**
 * Order detail for the buyer and the seller (approved design; not in Figma): items, progress and
 * status history on the left; summary, next step with actions, delivery details and the other person
 * on the right. Refreshes every 30 s and after any order action (Q4).
 */
export default function OrderDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data: order, error, isLoading, reload } = useLiveOrders(() => orderService.getOrder(id), `order-${id}`)
  const { handleAction, busyActionFor, feedback, dialogProps } = useOrderActions()

  const listLink = order?.role === 'seller' ? PATHS.sales : PATHS.orders
  const breadcrumb = [
    { label: 'Home', to: PATHS.home },
    { label: order?.role === 'seller' ? 'My sales' : 'My orders', to: listLink },
    { label: order ? t('Order {code}', { code: orderCode(order.id) }) : t('Order') },
  ]

  let content
  if (error) {
    content = <ErrorState title={t("Couldn’t load this order")} message={describeApiError(error).message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message={t("Loading order…")} />
  } else if (!order) {
    content = (
      <EmptyState
        titleAs="h1"
        title={t("Order not found")}
        description={t("It may belong to another student, or the sample data was reset.")}
        action={
          <Link to={PATHS.orders} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t("Go to My orders")}
          </Link>
        }
      />
    )
  } else {
    const { role } = order
    const counterpart = role === 'buyer' ? order.seller : order.buyer
    const delivery = order.delivery ?? {}
    const paymentLabel = PAYMENT_METHODS.find((m) => m.value === order.paymentMethod)?.label

    content = (
      <>
        <header className="mt-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t('Order {code}', { code: orderCode(order.id) })}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {role === 'buyer' ? t('You’re buying') : t('You’re selling')} · {t('Placed {date}', { date: formatDateTime(order.createdAt) })}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </header>

        <div aria-live="polite" className="empty:hidden">
          {feedback && (
            <Alert variant={feedback.variant} className="mb-4">
              {feedback.text}
            </Alert>
          )}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-6">
            <Card
              title={t(
                role === 'buyer' ? (order.items.length === 1 ? '{count} item from {name}' : '{count} items from {name}') : order.items.length === 1 ? '{count} item for {name}' : '{count} items for {name}',
                { count: order.items.length, name: role === 'buyer' ? order.seller?.name : order.buyer?.name },
              )}
            >
              <OrderItemList items={order.items} size="full" />
            </Card>
            {order.status !== 'CANCELLED' && (
              <Card title={t("Progress")}>
                <OrderProgress status={order.status} />
              </Card>
            )}
            {order.status === 'COMPLETED' && <OrderReviews order={order} onWriteReview={() => handleAction(order, 'review')} />}
            {order.isBackend && order.disputes?.length > 0 && <OrderDisputes disputes={order.disputes} />}
            <Card title={t("Status history")}>
              <OrderTimeline order={order} />
            </Card>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
            {order.isBackend ? (
              <BackendSummary order={order} />
            ) : (
            <Card title={t("Summary")}>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t('Items ({count})', { count: order.items.length })}</dt>
                  <dd className="text-ink">{formatPrice(order.amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("Delivery")}</dt>
                  <dd className="text-ink">{t("Arranged by seller")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("Payment")}</dt>
                  <dd className="text-right text-ink">{paymentLabel ? `${t(paymentLabel)} · ${t('online')}` : t('Online, after confirmation')}</dd>
                </div>
                <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
                  <dt className="font-semibold text-ink">{t("Total")}</dt>
                  <dd className="text-2xl font-bold tracking-tight text-ink">{formatPrice(order.amount)}</dd>
                </div>
              </dl>
            </Card>
            )}

            <OrderNextStep
              layout="stacked"
              step={nextStep(order, role)}
              canSimulate={isSampleOrders && OTHER_PARTY_TURN[role].includes(order.status)}
              otherParty={role === 'buyer' ? 'seller' : 'buyer'}
              busyAction={busyActionFor(order)}
              onAction={(action) => handleAction(order, action)}
            />

            {order.isBackend ? (
              <BackendDelivery order={order} />
            ) : (
            <Card title={t("Deliver to")}>
              <p className="flex gap-2 text-sm">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="block font-medium text-ink">{delivery.fullName}</span>
                  <span className="block text-ink-muted">{delivery.phone}</span>
                  <span className="block text-ink-muted">
                    {delivery.address} · {t(UNIVERSITY_NAME)} {t(CAMPUSES[delivery.campus]?.label)}
                  </span>
                  {delivery.note && <span className="mt-1 block text-ink-muted italic">“{delivery.note}”</span>}
                </span>
              </p>
            </Card>
            )}

            <Card title={role === 'buyer' ? t('Seller') : t('Buyer')}>
              <div className="flex items-center gap-3">
                <Avatar name={counterpart?.name} size="sm" className="size-10" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {counterpart ? (
                      <Link to={PATHS.user(counterpart.id)} className="hover:text-primary hover:underline">
                        {counterpart.name}
                      </Link>
                    ) : (
                      t('Former student')
                    )}
                    {counterpart?.emailVerified && (
                      <>
                        <BadgeCheckIcon className="size-4 text-primary" />
                        <span className="sr-only">{t("Email verified")}</span>
                      </>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-muted">{counterpart?.programme}</p>
                </div>
              </div>
            </Card>

            <p className="flex gap-2 px-1 text-xs text-ink-muted">
              <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
              {t("Payments only happen online through UniMarket. Never pay or accept money directly.")}
            </p>
          </aside>
        </div>
      </>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{order ? `Order ${order.code ?? orderCode(order.id)} · UniMarket` : 'Order · UniMarket'}</title>
      <Breadcrumbs items={breadcrumb} />
      <SampleDataNotice className="mt-5">{t("Sample order saved in this browser only. Payments are simulated. This page refreshes every 30 seconds.")}</SampleDataNotice>
      {content}
      <OrderActionDialogs {...dialogProps} />
    </PageContainer>
  )
}
