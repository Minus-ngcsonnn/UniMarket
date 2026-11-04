import { useState } from 'react'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import DataTable from '../../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../../components/admin/DetailDialog'
import { EyeIcon } from '../../../components/icons'
import OrderStatusBadge from '../../../components/orders/OrderStatusBadge'
import Button from '../../../components/ui/Button'
import ErrorState from '../../../components/ui/ErrorState'
import FilterTabs from '../../../components/ui/FilterTabs'
import LoadingState from '../../../components/ui/LoadingState'
import { ORDER_STATUSES, PROVIDER_LABELS } from '../../../constants/order'
import useAdminList from '../../../hooks/useAdminList'
import useAsyncData from '../../../hooks/useAsyncData'
import { adminBackendApi, adminErrorText } from '../../../services/admin/adminBackendApi'
import { formatDateTime } from '../../../utils/format'
import useTranslation from '../../../i18n/useTranslation'
import { HistoryList, SimulatedTag } from './liveAdmin'
import { money, toAdminPage } from './liveAdminFormat'

const loadOrders = (params) => adminBackendApi.orders({ status: params.status, page: params.page, size: params.pageSize }).then(toAdminPage)

/** Shipping line: simulated quote (carrier, distance) or LEGACY (orders created before V003, stored fee only). */
function shippingText(order, t) {
  const s = order.shipping
  if (!s) return money(order.amounts?.shippingFee)
  if (s.source === 'LEGACY') return `${money(s.fee)} · ${t('earlier order (no quote)')}`
  return `${money(s.fee)} · ${t(s.label ?? s.carrier ?? 'Simulated delivery')}${s.distanceKm != null ? ` · ${t('about {km} km', { km: Number(s.distanceKm) })}` : ''}`
}

/** Read-only admin view of one order: amounts, 3 % commission and payout, payments, delivery, history, disputes. */
function OrderDetail({ id, onClose }) {
  const { t } = useTranslation()
  const { data: order, error, isLoading, reload } = useAsyncData(() => adminBackendApi.order(id), `admin-order-${id}`)
  const sandbox = order?.payments?.some((p) => p.sandbox) || order?.settlement?.sandbox
  return (
    <DetailDialog
      title={order ? t('Order {code}', { code: order.code }) : t('Order')}
      subtitle={order ? `${order.buyer?.fullName} → ${order.seller?.fullName}` : undefined}
      status={order && <OrderStatusBadge status={order.status} />}
      onClose={onClose}
    >
      {error ? (
        <ErrorState title={t('Couldn’t load this order')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : isLoading ? (
        <LoadingState message={t('Loading order…')} />
      ) : (
        <>
          <ul className="flex flex-col gap-1 text-sm">
            {order.items.map((item) => (
              <li key={item.productId} className="flex justify-between gap-3">
                <span className="text-ink">{item.title}</span>
                <span className="font-medium whitespace-nowrap text-ink">{money(item.unitPrice)}</span>
              </li>
            ))}
          </ul>
          <DetailList
            items={[
              ['Items subtotal', money(order.amounts.subtotal)],
              ['Delivery', shippingText(order, t)],
              ['Buyer pays', money(order.amounts.total)],
              ['Commission (3 % of items)', money(order.amounts.commission)],
              ['Seller payout', money(order.amounts.sellerPayout)],
              ['Payment provider', order.paymentProvider && t(PROVIDER_LABELS[order.paymentProvider] ?? order.paymentProvider)],
              ['Confirm by', order.deadlines?.confirmBy && formatDateTime(order.deadlines.confirmBy)],
              ['Pay by', order.deadlines?.paymentDueAt && formatDateTime(order.deadlines.paymentDueAt)],
              ['Settlement', order.settlement && `${t(order.settlement.status)} · ${money(order.settlement.amount)}`],
              ['Cancellation', order.cancellationReason],
            ]}
          />
          {sandbox && (
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <SimulatedTag /> {t('Payments of this order are sandbox simulations: no money was charged.')}
            </p>
          )}
          {order.delivery && (
            <DetailList
              items={[
                ['Recipient', order.delivery.recipientName],
                ['Phone', order.delivery.recipientPhone],
                ['Address', order.delivery.address],
                ['Shipment', order.shipment && `${order.shipment.carrier ?? '—'}${order.shipment.trackingNumber ? ` · ${order.shipment.trackingNumber}` : ''}`],
              ]}
            />
          )}
          {order.payments?.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">{t('Payment attempts')}</h3>
              <ul className="flex flex-col gap-1 text-xs text-ink-muted">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>
                      {t(PROVIDER_LABELS[p.provider] ?? p.provider)} · {formatDateTime(p.createdAt)}
                    </span>
                    <span className="font-medium text-ink">
                      {t(p.status)} · {money(p.amount)} {p.sandbox && <SimulatedTag />}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('Status history')}</h3>
            <HistoryList events={(order.history ?? []).map((h) => ({ action: h.status, reason: h.note, at: h.changedAt, admin: h.changedBy && { name: h.changedBy } }))} />
          </section>
          {order.disputes?.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">{t('Disputes')}</h3>
              <HistoryList events={order.disputes.map((d) => ({ action: `${d.status}${d.decision ? ` · ${d.decision}` : ''}`, reason: d.resolution ?? d.reason, at: d.resolvedAt ?? d.createdAt, admin: { name: d.openedBy } }))} />
            </section>
          )}
        </>
      )}
    </DetailDialog>
  )
}

/** Admin › Orders with the real API (read only: admins never change an order's buyer / seller state here). */
export default function LiveAdminOrdersPage() {
  const { t } = useTranslation()
  const list = useAdminList('live-admin-orders', loadOrders, ['status'])
  const [detailId, setDetailId] = useState(null)
  const columns = [
    { key: 'code', header: 'Order', render: (row) => <span className="font-medium whitespace-nowrap text-ink">{row.code}</span> },
    { key: 'people', header: 'Buyer → seller', render: (row) => <span className="text-ink-muted">{`${row.buyer?.fullName} → ${row.seller?.fullName}`}</span> },
    { key: 'items', header: 'Items', render: (row) => <span className="line-clamp-2 max-w-[16rem] text-ink">{row.items.map((i) => i.title).join(', ')}</span> },
    {
      key: 'amounts',
      header: 'Total',
      className: 'whitespace-nowrap',
      render: (row) => (
        <>
          <p className="text-ink">{money(row.amounts.total)}</p>
          <p className="text-xs text-ink-muted">{t('incl. delivery {fee}', { fee: money(row.amounts.shippingFee) })}</p>
        </>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <OrderStatusBadge status={row.status} /> },
    { key: 'created', header: 'Placed', className: 'whitespace-nowrap', render: (row) => formatDateTime(row.timestamps?.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setDetailId(row.id)}>
          <EyeIcon className="size-4" />
          {t('Details')}
        </Button>
      ),
    },
  ]
  const data = list.list
  return (
    <>
      <title>{t('Orders · UniMarket Admin')}</title>
      <AdminPageHeader title={t('Orders')} description={t('All orders, newest first. Read only: buyers and sellers move their orders; admins handle disputes and payouts.')} />
      <FilterTabs
        label={t('Filter by order status')}
        value={list.params.status}
        onChange={(value) => list.setFilter('status', value)}
        options={[{ value: '', label: 'All' }, ...Object.keys(ORDER_STATUSES).map((key) => ({ value: key, label: ORDER_STATUSES[key].label }))]}
        className="mb-4"
      />
      <DataTable
        caption={t('Orders')}
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error && { message: adminErrorText(list.error) }}
        onRetry={list.reload}
        minWidth="56rem"
        emptyTitle={t('No orders match')}
        emptyDescription={t('Try another status.')}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'orders' }}
      />
      {detailId && <OrderDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
