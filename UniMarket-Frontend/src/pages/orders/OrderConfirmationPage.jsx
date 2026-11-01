import { Link, useSearchParams } from 'react-router'
import CheckoutSteps from '../../components/checkout/CheckoutSteps'
import { CheckCircleIcon } from '../../components/icons'
import PageContainer from '../../components/layout/PageContainer'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import OrderItemList from '../../components/orders/OrderItemList'
import LoadingState from '../../components/ui/LoadingState'
import { SELLER_CONFIRM_HOURS, orderCode } from '../../constants/order'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { orderService } from '../../services/orders/orderService'
import { formatDateTime, formatPrice } from '../../utils/format'

const WHAT_NEXT = [
  { title: 'Seller confirms', text: `Each seller has ${SELLER_CONFIRM_HOURS} hours to confirm your order.` },
  { title: 'You pay online', text: 'Pay securely on UniMarket from My orders. Nothing has been charged yet.' },
  { title: 'Seller delivers', text: 'The seller brings the item to the address you gave.' },
  { title: 'You confirm receipt', text: 'Confirm you’ve received it to complete the order.' },
]

/** Checkout step 3: order requests sent, with what happens next. Orders come from ?ids=. */
export default function OrderConfirmationPage() {
  const [searchParams] = useSearchParams()
  const ids = (searchParams.get('ids') ?? '').split(',').map(Number).filter(Boolean)
  const { data: orders, error, isLoading, reload } = useAsyncData(
    () => (ids.length ? orderService.getOrders(ids) : Promise.resolve([])),
    `confirmation-${ids.join(',')}`,
  )

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load your orders" message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message="Loading your orders…" />
  } else if (!orders.length) {
    content = (
      <EmptyState
        titleAs="h1"
        title="We couldn’t find these orders"
        description="They may belong to another account, or the sample data was reset."
        action={
          <Link to={PATHS.orders} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Go to My orders
          </Link>
        }
      />
    )
  } else {
    const total = orders.reduce((sum, order) => sum + order.amount, 0)
    content = (
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircleIcon className="size-6" />
          </span>
          <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink">
            {orders.length === 1 ? 'Order request sent' : `${orders.length} order requests sent`}
          </h1>
          <p className="mt-2 text-ink-muted">
            We’ve let {orders.length === 1 ? 'the seller' : 'the sellers'} know. You’ll pay online once {orders.length === 1 ? 'they confirm' : 'each one confirms'}.
          </p>

          <ul className="mt-6 flex flex-col gap-4">
            {orders.map((order) => (
              <li key={order.id} className="rounded-card border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <Link to={PATHS.order(order.id)} className="font-semibold text-ink hover:text-primary">
                      Order {orderCode(order.id)}
                    </Link>
                    <span className="text-ink-muted"> · Seller {order.seller?.name} · confirm by {formatDateTime(order.confirmBy)}</span>
                  </p>
                  <OrderStatusBadge status={order.status} />
                </div>
                <OrderItemList items={order.items} />
                <p className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
                  <span className="text-ink-muted">Order total</span>
                  <span className="font-semibold text-ink">{formatPrice(order.amount)}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between text-sm">
            <span className="text-ink-muted">Total to pay after confirmation</span>
            <span className="font-semibold text-ink">{formatPrice(total)}</span>
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link to={PATHS.orders} className={buttonClasses({ size: 'lg' })}>
              View my orders
            </Link>
            <Link to={PATHS.marketplace} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              Continue shopping
            </Link>
          </div>
        </section>

        <aside aria-labelledby="next-title" className="rounded-card bg-subtle p-5 sm:p-6">
          <h2 id="next-title" className="font-semibold text-ink">
            What happens next
          </h2>
          <ol className="mt-4 flex flex-col gap-4">
            {WHAT_NEXT.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{index + 1}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{step.title}</p>
                  <p className="text-sm text-ink-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>Order confirmation · UniMarket</title>
      <div className="mb-6 flex justify-end">
        <CheckoutSteps current="Confirmation" />
      </div>
      <SampleDataNotice className="mb-5">These sample orders are saved in this browser only. No payment has been taken.</SampleDataNotice>
      {content}
    </PageContainer>
  )
}
