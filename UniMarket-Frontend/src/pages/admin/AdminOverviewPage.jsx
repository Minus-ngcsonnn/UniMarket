import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { listingActionItems } from '../../components/admin/adminRowActions'
import DashboardStatCard from '../../components/admin/DashboardStatCard'
import DataTable from '../../components/admin/DataTable'
import { ListingCell, ListingDetailDialog } from '../../components/admin/ListingAdmin'
import { ArrowRightIcon, CheckCircleIcon, DownloadIcon, FlagIcon, PackageIcon, TagIcon, TrendingUpIcon, UsersIcon } from '../../components/icons'
import VerificationBadge from '../../components/profile/VerificationBadge'
import { ModerationBadge, ProductStatusBadge } from '../../components/product/ProductBadges'
import ActionMenu from '../../components/ui/ActionMenu'
import Alert from '../../components/ui/Alert'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import FilterTabs from '../../components/ui/FilterTabs'
import StatusPill from '../../components/ui/StatusPill'
import { ACCOUNT_STATUSES } from '../../constants/moderation'
import { CAMPUSES, listingCode } from '../../constants/product'
import useAdminActions from '../../hooks/useAdminActions'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { adminService } from '../../services/admin/adminService'
import { formatDate, formatPrice, formatRelativeTime } from '../../utils/format'

const TABS = [
  { value: 'products', label: 'Products' },
  { value: 'users', label: 'Users' },
]
const compact = new Intl.NumberFormat('vi-VN')

/** Attention card: a count with a link to the list that needs work. */
function AttentionCard({ count, title, emptyTitle, text, to, Icon }) {
  const isClear = count === 0
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-primary">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${isClear ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
        {isClear ? <CheckCircleIcon className="size-5" /> : <Icon className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{isClear ? emptyTitle : title}</span>
        <span className="block text-sm text-ink-muted">{text}</span>
      </span>
      <ArrowRightIcon className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  )
}

/** "Marketplace management" (Figma): the newest listings or students with quick actions. */
function ManagementPanel({ campus }) {
  const [tab, setTab] = useState('products')
  const [detail, setDetail] = useState(null)
  const { open, dialog } = useAdminActions()
  const query = useAsyncData(
    () => (tab === 'products' ? adminService.listListings({ campus, pageSize: 5 }) : adminService.listUsers({ campus, pageSize: 5 })),
    `overview-${tab}-${campus}`,
  )

  const productColumns = [
    { key: 'product', header: 'Product', render: (row) => <ListingCell listing={row} /> },
    { key: 'seller', header: 'Seller', render: (row) => row.seller?.name },
    { key: 'price', header: 'Price', className: 'whitespace-nowrap', render: (row) => <span className="font-medium text-ink">{formatPrice(row.price)}</span> },
    { key: 'review', header: 'Review', render: (row) => <ModerationBadge moderation={row.moderation} audience="admin" showApproved /> },
    { key: 'sale', header: 'Sale status', render: (row) => <ProductStatusBadge status={row.status} /> },
    { key: 'listed', header: 'Listed', className: 'whitespace-nowrap', render: (row) => <span className="text-ink-muted">{formatRelativeTime(row.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => <ActionMenu label={`Actions for ${row.title}`} heading={`Listing ${listingCode(row.id)}`} items={listingActionItems(row, { onDetails: setDetail, open })} />,
    },
  ]
  const userColumns = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{row.name}</p>
            <p className="max-w-[14rem] truncate text-xs text-ink-muted">{row.programme}</p>
          </div>
        </div>
      ),
    },
    { key: 'campus', header: 'Campus', render: (row) => <span className="text-ink-muted">{CAMPUSES[row.campus]?.label}</span> },
    { key: 'verification', header: 'Verification', render: (row) => (row.verified || row.emailVerified ? <VerificationBadge user={row} /> : <span className="text-xs font-medium text-warning">Not verified</span>) },
    { key: 'joined', header: 'Joined', className: 'whitespace-nowrap', render: (row) => <span className="text-ink-muted">{formatDate(row.memberSince)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusPill tone={ACCOUNT_STATUSES[row.status]?.tone}>{ACCOUNT_STATUSES[row.status]?.label}</StatusPill> },
  ]

  return (
    <section aria-labelledby="management-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="management-title" className="text-lg font-bold text-ink">
          Marketplace management
        </h2>
        <div className="flex items-center gap-3">
          <FilterTabs label="Show" options={TABS} value={tab} onChange={setTab} />
          <Link to={tab === 'products' ? PATHS.adminProducts : PATHS.adminUsers} className="text-sm font-semibold whitespace-nowrap text-primary hover:underline">
            View all
          </Link>
        </div>
      </div>
      <DataTable
        key={tab}
        caption={tab === 'products' ? 'Newest listings' : 'Newest students'}
        columns={tab === 'products' ? productColumns : userColumns}
        rows={query.data?.items}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={query.reload}
        emptyTitle="Nothing here yet"
      />
      {detail && <ListingDetailDialog listing={detail} open={open} onClose={() => setDetail(null)} />}
      {dialog}
    </section>
  )
}

/** Admin › Overview (Figma admin dashboard). Numbers come from sample data and are labelled as such. */
export default function AdminOverviewPage() {
  const { campus } = useOutletContext() ?? {}
  const { data, error, isLoading, reload } = useAsyncData(() => adminService.getOverview({ campus }), `admin-overview-${campus}`)
  const [exportResult, setExportResult] = useState(null)
  const [isExporting, setIsExporting] = useState(false)

  async function exportReport() {
    setIsExporting(true)
    try {
      setExportResult(await adminService.exportReport({ campus }))
    } catch (exportError) {
      setExportResult({ error: exportError.message })
    } finally {
      setIsExporting(false)
    }
  }

  const stats = data?.stats
  const cards = stats && [
    { key: 'totalUsers', label: 'Total users', value: compact.format(stats.totalUsers), note: `${stats.verifiedUsers} verified students`, Icon: UsersIcon },
    { key: 'activeListings', label: 'Active listings', value: compact.format(stats.activeListings), note: `${stats.pendingListings} awaiting review`, Icon: TagIcon },
    { key: 'completedOrders', label: 'Completed orders', value: compact.format(stats.completedOrders), note: 'Delivered and confirmed by the buyer', Icon: PackageIcon },
    { key: 'completedValue', label: 'Completed order value', value: formatPrice(stats.completedValue), note: 'Paid online by buyers, not platform revenue', Icon: TrendingUpIcon },
  ]

  return (
    <>
      <title>Admin overview · UniMarket</title>
      <AdminPageHeader
        title="Overview"
        description={`Marketplace activity${campus ? ` at ${CAMPUSES[campus]?.label}` : ' across all campuses'}.`}
        actions={
          <Button variant="secondary" onClick={exportReport} loading={isExporting}>
            <DownloadIcon className="size-4" />
            Export report
          </Button>
        }
      />

      <div aria-live="polite" className="empty:hidden">
        {exportResult && (
          <Alert variant={exportResult.error ? 'danger' : exportResult.saved ? 'success' : 'warning'} title={exportResult.error ? 'Export failed' : exportResult.saved ? 'Report exported' : 'Preview only: no file was created'} className="mb-6">
            {exportResult.error ?? (exportResult.saved ? 'The report was downloaded.' : 'Exporting reports needs the UniMarket backend, which isn’t connected yet.')}
          </Alert>
        )}
      </div>

      {error ? (
        <ErrorState title="Couldn’t load statistics" message={error.message} onRetry={reload} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={isLoading || undefined}>
          {isLoading
            ? [1, 2, 3, 4].map((key) => <div key={key} className="h-36 animate-pulse rounded-2xl bg-subtle" />)
            : cards.map(({ key, ...card }) => <DashboardStatCard key={key} {...card} trend={data.trends[key]} isSample={data.isSample} />)}
        </div>
      )}

      {stats && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <AttentionCard
            count={stats.pendingListings}
            title={`${stats.pendingListings} listing${stats.pendingListings === 1 ? '' : 's'} awaiting review`}
            emptyTitle="No listings awaiting review"
            text="New and edited listings stay hidden until you approve them."
            to={`${PATHS.adminProducts}?moderation=PENDING`}
            Icon={TagIcon}
          />
          <AttentionCard
            count={stats.openReports}
            title={`${stats.openReports} open violation report${stats.openReports === 1 ? '' : 's'}`}
            emptyTitle="No open reports"
            text="Reports from students about listings and accounts."
            to={`${PATHS.adminReports}?status=OPEN`}
            Icon={FlagIcon}
          />
        </div>
      )}

      <div className="mt-8">
        <ManagementPanel campus={campus} />
      </div>
    </>
  )
}
