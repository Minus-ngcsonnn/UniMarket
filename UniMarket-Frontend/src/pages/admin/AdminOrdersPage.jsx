import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminSearch from '../../components/admin/AdminSearch'
import DataTable from '../../components/admin/DataTable'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import FilterTabs from '../../components/ui/FilterTabs'
import { ORDER_STATUSES, PAYMENT_METHODS, orderCode } from '../../constants/order'
import { CAMPUSES } from '../../constants/product'
import useAdminList from '../../hooks/useAdminList'
import { adminService } from '../../services/admin/adminService'
import { formatDateTime, formatPrice } from '../../utils/format'

const columns = [
  {
    key: 'order',
    header: 'Order',
    render: (row) => (
      <div>
        <p className="font-medium text-ink">{orderCode(row.id)}</p>
        <p className="text-xs text-ink-muted">{formatDateTime(row.createdAt)}</p>
      </div>
    ),
  },
  {
    key: 'items',
    header: 'Items',
    render: (row) => (
      <div className="min-w-0">
        <p className="max-w-[16rem] truncate text-ink">{row.items[0]?.title}</p>
        {row.items.length > 1 && <p className="text-xs text-ink-muted">+{row.items.length - 1} more</p>}
      </div>
    ),
  },
  { key: 'buyer', header: 'Buyer', render: (row) => row.buyer?.name },
  { key: 'seller', header: 'Seller', render: (row) => row.seller?.name },
  { key: 'campus', header: 'Campus', render: (row) => <span className="text-ink-muted">{CAMPUSES[row.delivery?.campus]?.label}</span> },
  {
    key: 'payment',
    header: 'Payment',
    render: (row) => <span className="text-ink-muted">{PAYMENT_METHODS.find((m) => m.value === row.paymentMethod)?.label ?? 'Not paid'}</span>,
  },
  { key: 'amount', header: 'Total', className: 'text-right whitespace-nowrap', render: (row) => <span className="font-medium text-ink">{formatPrice(row.amount)}</span> },
  { key: 'status', header: 'Status', render: (row) => <OrderStatusBadge status={row.status} /> },
]

/**
 * Admin › Orders, read only (approved scope): admins can follow orders but not change them in this
 * version; buyers and sellers move orders forward themselves.
 */
export default function AdminOrdersPage() {
  const list = useAdminList('admin-orders', adminService.listOrders, ['status'])
  const { params, list: data } = list
  const counts = data?.counts ?? {}

  return (
    <>
      <title>Orders · UniMarket Admin</title>
      <AdminPageHeader title="Orders" description="Read only. Follow orders between students; buyers and sellers move them forward themselves." />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          label="Filter by order status"
          value={params.status}
          onChange={(value) => list.setFilter('status', value)}
          options={[{ value: '', label: 'All', count: counts.all }, ...Object.entries(ORDER_STATUSES).map(([key, config]) => ({ value: key, label: config.label, count: counts[key] }))]}
        />
        <AdminSearch label="Search orders" placeholder="UO code, student or item" value={params.q} onSearch={list.setSearch} />
      </div>

      <DataTable
        caption="Orders"
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error}
        onRetry={list.reload}
        minWidth="60rem"
        emptyTitle="No orders match"
        emptyDescription="Try another status or search."
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'orders' }}
      />
    </>
  )
}
