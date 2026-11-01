import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PackageIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import OrderCard from '../../components/orders/OrderCard'
import PaymentDialog from '../../components/orders/PaymentDialog'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Alert from '../../components/ui/Alert'
import { buttonClasses } from '../../components/ui/buttonClasses'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import LoadingState from '../../components/ui/LoadingState'
import { orderCode } from '../../constants/order'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { orderService } from '../../services/orders/orderService'

/** What each order action does, whether it needs confirmation, and the message afterwards. */
const ACTIONS = {
  cancel: {
    run: orderService.cancelOrder,
    done: 'Order cancelled. The listing is available again.',
    confirm: {
      title: 'Cancel this order?',
      message: 'The seller will be told and the listing becomes available to other students again.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      tone: 'danger',
    },
  },
  decline: {
    run: orderService.declineOrder,
    done: 'Order declined. Your listing is available again.',
    confirm: {
      title: 'Decline this order?',
      message: 'The buyer will be told that you can’t sell the item to them. Your listing becomes available again.',
      confirmLabel: 'Decline order',
      cancelLabel: 'Go back',
      tone: 'danger',
    },
  },
  received: {
    run: orderService.confirmReceived,
    done: 'Order completed. Enjoy your new find!',
    confirm: {
      title: 'Have you received the item?',
      message: 'Only confirm once you have the item and it matches the listing. This completes the order.',
      confirmLabel: 'Yes, I’ve received it',
      cancelLabel: 'Not yet',
      tone: 'primary',
    },
  },
  confirm: { run: orderService.confirmOrder, done: 'Order confirmed. The buyer can now pay online.' },
  ship: { run: orderService.markDelivering, done: 'Marked as delivering. The buyer will confirm when they receive it.' },
  simulate: { run: orderService.simulateOtherParty, done: 'Simulated the other person’s next step (sample data).' },
}

const VIEWS = [
  { key: 'purchases', label: 'Purchases', role: 'buyer' },
  { key: 'sales', label: 'Sales', role: 'seller' },
]

/**
 * My orders: the buyer side ("Purchases") and seller side ("Sales") of the Business Plan order flow.
 * ?view=sales opens the Sales tab.
 */
export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = VIEWS.find((v) => v.key === searchParams.get('view')) ?? VIEWS[0]
  const lists = {
    purchases: useAsyncData(() => orderService.listOrders('buyer'), 'orders-buyer'),
    sales: useAsyncData(() => orderService.listOrders('seller'), 'orders-seller'),
  }
  const current = lists[view.key]
  const orders = current.data ?? current.previousData

  const [busy, setBusy] = useState(null) // { orderId, action }
  const [dialog, setDialog] = useState(null) // { type: 'pay' | 'confirm', order, action }
  const [feedback, setFeedback] = useState(null) // { variant, text }

  function reloadAll() {
    lists.purchases.reload()
    lists.sales.reload()
  }

  async function run(order, action) {
    setBusy({ orderId: order.id, action })
    setFeedback(null)
    try {
      await ACTIONS[action].run(order.id)
      setFeedback({ variant: 'success', text: `${orderCode(order.id)}: ${ACTIONS[action].done}` })
      reloadAll()
    } catch (actionError) {
      setFeedback({ variant: 'danger', text: `${orderCode(order.id)}: ${actionError.message}` })
    } finally {
      setBusy(null)
      setDialog(null)
    }
  }

  function handleAction(order, action) {
    if (action === 'pay') setDialog({ type: 'pay', order })
    else if (ACTIONS[action].confirm) setDialog({ type: 'confirm', order, action })
    else run(order, action)
  }

  let content
  if (current.error) {
    content = <ErrorState title="Couldn’t load your orders" message={current.error.message} onRetry={current.reload} />
  } else if (!orders) {
    content = <LoadingState message="Loading your orders…" />
  } else if (orders.length === 0) {
    content =
      view.key === 'purchases' ? (
        <EmptyState
          icon={<PackageIcon className="size-6" />}
          title="No purchases yet"
          description="Items you order will show up here, with every step from seller confirmation to delivery."
          action={
            <Link to={PATHS.marketplace} className={buttonClasses({ size: 'sm' })}>
              Explore marketplace
            </Link>
          }
        />
      ) : (
        <EmptyState
          icon={<PackageIcon className="size-6" />}
          title="No sales yet"
          description="When a student orders one of your listings, you’ll confirm it here."
          action={
            <Link to={PATHS.sell} className={buttonClasses({ size: 'sm' })}>
              Sell an item
            </Link>
          }
        />
      )
  } else {
    content = (
      <ul className={`flex flex-col gap-4 transition-opacity ${current.isLoading ? 'opacity-60' : ''}`} aria-label={view.label}>
        {orders.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} role={view.role} onAction={handleAction} busyAction={busy?.orderId === order.id ? busy.action : null} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <PageContainer width="lg" className="py-6 sm:py-8">
      <title>My orders · UniMarket</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My orders' }]} />

      <header className="mt-4">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">My orders</h1>
        <p className="mt-1.5 text-ink-muted">Follow every order from confirmation to delivery, as a buyer and as a seller.</p>
      </header>

      <SampleDataNotice className="mt-5">
        Orders are kept in this browser tab only and reset when you reload. Payments are simulated and the “Simulate” buttons play the other person’s step.
      </SampleDataNotice>

      <nav aria-label="Order type" className="mt-6 mb-5 flex gap-1 border-b border-line">
        {VIEWS.map(({ key, label }) => {
          const count = (lists[key].data ?? lists[key].previousData)?.length
          return (
            <button
              key={key}
              type="button"
              aria-pressed={view.key === key}
              onClick={() => {
                setFeedback(null)
                setSearchParams(key === 'sales' ? { view: 'sales' } : {})
              }}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                view.key === key ? 'border-primary font-medium text-primary' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {label}
              {count != null && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${view.key === key ? 'bg-primary-soft text-primary' : 'bg-subtle text-ink-muted'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div aria-live="polite" className="empty:hidden">
        {feedback && (
          <Alert variant={feedback.variant} className="mb-4">
            {feedback.text}
          </Alert>
        )}
      </div>

      {content}

      {dialog?.type === 'pay' && <PaymentDialog order={dialog.order} onClose={() => setDialog(null)} onPaid={reloadAll} />}
      {dialog?.type === 'confirm' && (
        <ConfirmDialog
          {...ACTIONS[dialog.action].confirm}
          isWorking={busy?.orderId === dialog.order.id}
          onConfirm={() => run(dialog.order, dialog.action)}
          onClose={() => setDialog(null)}
        />
      )}
    </PageContainer>
  )
}
