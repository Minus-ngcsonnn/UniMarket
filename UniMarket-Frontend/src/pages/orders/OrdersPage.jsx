import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PackageIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import OrderActionDialogs from '../../components/orders/OrderActionDialogs'
import OrderCard from '../../components/orders/OrderCard'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Alert from '../../components/ui/Alert'
import { buttonClasses } from '../../components/ui/buttonClasses'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import LoadingState from '../../components/ui/LoadingState'
import { NEEDS_ACTION, ORDER_FILTERS } from '../../constants/order'
import useLiveOrders from '../../hooks/useLiveOrders'
import useOrderActions from '../../hooks/useOrderActions'
import { PATHS } from '../../routes/paths'
import { orderService } from '../../services/orders/orderService'
import useTranslation from '../../i18n/useTranslation'

const VIEWS = [
  { key: 'purchases', label: 'Purchases', role: 'buyer' },
  { key: 'sales', label: 'Sales', role: 'seller' },
]

const EMPTY = {
  purchases: {
    title: 'No purchases yet',
    description: 'Orders you place will show up here, with every step from seller confirmation to delivery.',
    action: { label: 'Explore marketplace', to: PATHS.marketplace },
  },
  sales: {
    title: 'No sales yet',
    description: 'When a student orders your listings, you’ll confirm the order here.',
    action: { label: 'Sell an item', to: PATHS.sell },
  },
}

const pillClass = (isActive) =>
  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${isActive ? 'bg-primary text-white' : 'bg-surface text-ink-muted ring-1 ring-line hover:text-ink'}`

/**
 * My orders: buyer side ("Purchases", order history) and seller side ("Sales", seller order management)
 * of the Business Plan flow, with a status filter. ?view=sales opens Sales, ?status=ACTIVE|COMPLETED|CANCELLED filters.
 * Lists refresh every 30 s and after any order action (Q4).
 */
export default function OrdersPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = VIEWS.find((v) => v.key === searchParams.get('view')) ?? VIEWS[0]
  const filter = ORDER_FILTERS.find((f) => f.key === searchParams.get('status')) ?? ORDER_FILTERS[0]
  const lists = {
    purchases: useLiveOrders(() => orderService.listOrders('buyer'), 'orders-buyer'),
    sales: useLiveOrders(() => orderService.listOrders('seller'), 'orders-seller'),
  }
  const { handleAction, busyActionFor, feedback, clearFeedback, dialogProps } = useOrderActions()
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  /** Sample data only: clears saved sample orders, then reloads so every sample module starts fresh. */
  async function resetSampleData() {
    setIsResetting(true)
    await orderService.resetSampleData()
    window.location.reload()
  }

  const current = lists[view.key]
  const orders = current.data
  const matches = (order, f) => !f.statuses || f.statuses.includes(order.status)
  const visible = (orders ?? []).filter((order) => matches(order, filter))
  const needsAction = (orders ?? []).filter((order) => NEEDS_ACTION[view.role].includes(order.status)).length

  /** Updates ?view= and ?status= (defaults are left out of the URL). */
  function setParams({ view: nextView = view.key, status: nextStatus = filter.key }) {
    clearFeedback()
    const params = {}
    if (nextView === 'sales') params.view = 'sales'
    if (nextStatus !== 'ALL') params.status = nextStatus
    setSearchParams(params)
  }

  let content
  if (current.error) {
    content = <ErrorState title={t("Couldn’t load your orders")} message={current.error.message} onRetry={current.reload} />
  } else if (!orders) {
    content = <LoadingState message={t("Loading your orders…")} />
  } else if (orders.length === 0) {
    const empty = EMPTY[view.key]
    content = (
      <EmptyState
        icon={<PackageIcon className="size-6" />}
        title={t(empty.title)}
        description={t(empty.description)}
        action={
          <Link to={empty.action.to} className={buttonClasses({ size: 'sm' })}>
            {t(empty.action.label)}
          </Link>
        }
      />
    )
  } else if (visible.length === 0) {
    content = <EmptyState title={t('No {status} orders', { status: t(filter.label).toLowerCase() })} description={t("Orders with this status will show up here.")} />
  } else {
    content = (
      <ul className="flex flex-col gap-4" aria-label={`${t(view.label)}, ${t(filter.label)}`}>
        {visible.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} role={view.role} onAction={handleAction} busyAction={busyActionFor(order)} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <PageContainer width="lg" className="py-6 sm:py-8">
      <title>{view.key === 'sales' ? t('My sales · UniMarket') : t('My orders · UniMarket')}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: view.key === 'sales' ? 'My sales' : 'My orders' }]} />

      <header className="mt-4">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("My orders")}</h1>
        <p className="mt-1.5 text-ink-muted">{t("Follow every order from confirmation to delivery, as a buyer and as a seller.")}</p>
      </header>

      <SampleDataNotice className="mt-5">
        {t('Sample orders are saved in this browser only. Payments are simulated and the “Simulate” buttons play the other person’s step.')}{' '}
        <button type="button" onClick={() => setIsResetOpen(true)} className="inline-block py-0.5 font-semibold text-primary hover:underline">
          {t("Reset sample data")}
        </button>
      </SampleDataNotice>
      {isResetOpen && (
        <ConfirmDialog
          title={t("Reset sample data?")}
          message={t("All sample orders you placed or changed are removed, and listings go back to their original status. Your cart is kept.")}
          confirmLabel={t("Reset sample data")}
          isWorking={isResetting}
          onConfirm={resetSampleData}
          onClose={() => setIsResetOpen(false)}
        />
      )}

      <nav aria-label={t("Order type")} className="mt-6 flex gap-1 border-b border-line">
        {VIEWS.map(({ key, label, role }) => {
          const list = lists[key].data
          const waiting = (list ?? []).filter((order) => NEEDS_ACTION[role].includes(order.status)).length
          return (
            <button
              key={key}
              type="button"
              aria-pressed={view.key === key}
              onClick={() => setParams({ view: key, status: 'ALL' })}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                view.key === key ? 'border-primary font-medium text-primary' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {t(label)}
              {list && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${view.key === key ? 'bg-primary-soft text-primary' : 'bg-subtle text-ink-muted'}`}>{list.length}</span>
              )}
              {waiting > 0 && <span className="size-2 rounded-full bg-warning" aria-label={`${waiting} need your action`} />}
            </button>
          )
        })}
      </nav>

      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("Filter by status")} className="flex flex-wrap gap-2">
          {ORDER_FILTERS.map((f) => {
            const count = (orders ?? []).filter((order) => matches(order, f)).length
            return (
              <button key={f.key} type="button" aria-pressed={filter.key === f.key} onClick={() => setParams({ status: f.key })} className={pillClass(filter.key === f.key)}>
                {t(f.label)} {orders && <span className="tabular-nums opacity-80">{count}</span>}
              </button>
            )
          })}
        </div>
        {needsAction > 0 && (
          <p className="flex items-center gap-2 text-sm text-ink">
            <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
            {t(needsAction === 1 ? '{count} order needs your action' : '{count} orders need your action', { count: needsAction })}
          </p>
        )}
      </div>

      <div aria-live="polite" className="empty:hidden">
        {feedback && (
          <Alert variant={feedback.variant} className="mb-4">
            {feedback.text}
          </Alert>
        )}
      </div>

      {content}
      <OrderActionDialogs {...dialogProps} />
    </PageContainer>
  )
}
