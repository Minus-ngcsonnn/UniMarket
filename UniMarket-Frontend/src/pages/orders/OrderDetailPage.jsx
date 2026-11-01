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
import { PAYMENT_METHODS, orderCode } from '../../constants/order'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import useLiveOrders from '../../hooks/useLiveOrders'
import useOrderActions from '../../hooks/useOrderActions'
import { PATHS } from '../../routes/paths'
import { orderService } from '../../services/orders/orderService'
import { isSampleData } from '../../services/products/productService'
import { formatDateTime, formatPrice, initials } from '../../utils/format'
import { OTHER_PARTY_TURN, nextStep } from '../../utils/orderFlow'

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-card border border-line bg-surface p-5 ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>}
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
  const { id } = useParams()
  const { data: order, error, isLoading, reload } = useLiveOrders(() => orderService.getOrder(id), `order-${id}`)
  const { handleAction, busyActionFor, feedback, dialogProps } = useOrderActions()

  const listLink = order?.role === 'seller' ? PATHS.sales : PATHS.orders
  const breadcrumb = [
    { label: 'Home', to: PATHS.home },
    { label: order?.role === 'seller' ? 'My sales' : 'My orders', to: listLink },
    { label: order ? `Order ${orderCode(order.id)}` : 'Order' },
  ]

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load this order" message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message="Loading order…" />
  } else if (!order) {
    content = (
      <EmptyState
        titleAs="h1"
        title="Order not found"
        description="It may belong to another student, or the sample data was reset."
        action={
          <Link to={PATHS.orders} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Go to My orders
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
            <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">Order {orderCode(order.id)}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {role === 'buyer' ? 'You’re buying' : 'You’re selling'} · Placed {formatDateTime(order.createdAt)}
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
            <Card title={`${order.items.length} ${order.items.length === 1 ? 'item' : 'items'} ${role === 'buyer' ? `from ${order.seller?.name}` : `for ${order.buyer?.name}`}`}>
              <OrderItemList items={order.items} size="full" />
            </Card>
            {order.status !== 'CANCELLED' && (
              <Card title="Progress">
                <OrderProgress status={order.status} />
              </Card>
            )}
            {order.status === 'COMPLETED' && <OrderReviews order={order} onWriteReview={() => handleAction(order, 'review')} />}
            <Card title="Status history">
              <OrderTimeline order={order} />
            </Card>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
            <Card title="Summary">
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Items ({order.items.length})</dt>
                  <dd className="text-ink">{formatPrice(order.amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Delivery</dt>
                  <dd className="text-ink">Arranged by seller</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Payment</dt>
                  <dd className="text-right text-ink">{paymentLabel ? `${paymentLabel} · online` : 'Online, after confirmation'}</dd>
                </div>
                <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
                  <dt className="font-semibold text-ink">Total</dt>
                  <dd className="text-2xl font-bold tracking-tight text-ink">{formatPrice(order.amount)}</dd>
                </div>
              </dl>
            </Card>

            <OrderNextStep
              layout="stacked"
              step={nextStep(order, role)}
              canSimulate={isSampleData && OTHER_PARTY_TURN[role].includes(order.status)}
              otherParty={role === 'buyer' ? 'seller' : 'buyer'}
              busyAction={busyActionFor(order)}
              onAction={(action) => handleAction(order, action)}
            />

            <Card title="Deliver to">
              <p className="flex gap-2 text-sm">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="block font-medium text-ink">{delivery.fullName}</span>
                  <span className="block text-ink-muted">{delivery.phone}</span>
                  <span className="block text-ink-muted">
                    {delivery.address} · {UNIVERSITY_NAME} {CAMPUSES[delivery.campus]?.label}
                  </span>
                  {delivery.note && <span className="mt-1 block text-ink-muted italic">“{delivery.note}”</span>}
                </span>
              </p>
            </Card>

            <Card title={role === 'buyer' ? 'Seller' : 'Buyer'}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden="true">
                  {initials(counterpart?.name ?? '?')}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {counterpart ? (
                      <Link to={PATHS.user(counterpart.id)} className="hover:text-primary hover:underline">
                        {counterpart.name}
                      </Link>
                    ) : (
                      'Former student'
                    )}
                    {counterpart?.verified && (
                      <>
                        <BadgeCheckIcon className="size-4 text-primary" />
                        <span className="sr-only">Verified student</span>
                      </>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-muted">{counterpart?.programme}</p>
                </div>
              </div>
            </Card>

            <p className="flex gap-2 px-1 text-xs text-ink-muted">
              <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
              Payments only happen online through UniMarket. Never pay or accept money directly.
            </p>
          </aside>
        </div>
      </>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{order ? `Order ${orderCode(order.id)} · UniMarket` : 'Order · UniMarket'}</title>
      <Breadcrumbs items={breadcrumb} />
      <SampleDataNotice className="mt-5">Sample order saved in this browser only. Payments are simulated. This page refreshes every 30 seconds.</SampleDataNotice>
      {content}
      <OrderActionDialogs {...dialogProps} />
    </PageContainer>
  )
}
