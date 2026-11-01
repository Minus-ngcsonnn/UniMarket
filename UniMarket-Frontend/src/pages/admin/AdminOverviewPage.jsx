import { useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import DashboardStatCard from '../../components/admin/DashboardStatCard'
import ListingsPanel from '../../components/admin/ListingsPanel'
import UsersPanel from '../../components/admin/UsersPanel'
import { ClockIcon, DownloadIcon, PackageIcon, ShoppingBagIcon, UsersIcon, WalletIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import { CAMPUSES } from '../../constants/product'
import useAdminList from '../../hooks/useAdminList'
import useAsyncData from '../../hooks/useAsyncData'
import { adminService } from '../../services/admin/adminService'
import { formatPrice } from '../../utils/format'

const numberFormat = new Intl.NumberFormat('vi-VN')

/** Products / Users tabs with counts, underlined like the Figma "Marketplace management" card. */
function ManagementTabs({ tab, onChange, counts }) {
  const tabs = [
    { value: 'products', label: 'Products', Icon: PackageIcon, count: counts.products },
    { value: 'users', label: 'Users', Icon: UsersIcon, count: counts.users },
  ]
  return (
    <div role="tablist" aria-label="Marketplace management" className="flex gap-6 border-b border-line px-5">
      {tabs.map(({ value, label, Icon, count }) => {
        const isActive = tab === value
        return (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={isActive}
            aria-controls="management-panel"
            onClick={() => onChange(value)}
            className={`-mb-px flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              isActive ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Icon className="size-4" />
            {label}
            {count != null && <span className={`text-xs tabular-nums ${isActive ? 'text-primary' : 'text-ink-muted'}`}>{numberFormat.format(count)}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Admin › Overview (Figma admin dashboard). Numbers come from sample data and are labelled as such. */
export default function AdminOverviewPage() {
  const { campus } = useOutletContext() ?? {}
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'users' ? 'users' : 'products'
  const overview = useAsyncData(() => adminService.getOverview({ campus }), `admin-overview-${campus}`)
  const listings = useAdminList('overview-listings', adminService.listListings, ['moderation', 'category', 'listed', 'sort'])
  const users = useAdminList('overview-users', adminService.listUsers, ['status', 'verification'])
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

  const stats = overview.data?.stats
  const cards = stats && [
    { key: 'totalUsers', label: 'Total users', value: numberFormat.format(stats.totalUsers), note: `${stats.verifiedUsers} verified student accounts`, Icon: UsersIcon },
    { key: 'activeListings', label: 'Active listings', value: numberFormat.format(stats.activeListings), note: `Available and approved · ${stats.pendingListings} awaiting review`, Icon: PackageIcon },
    { key: 'completedOrders', label: 'Completed orders', value: numberFormat.format(stats.completedOrders), note: 'Successful student exchanges', Icon: ShoppingBagIcon },
    { key: 'completedValue', label: 'Completed order value', value: formatPrice(stats.completedValue), note: 'Paid online by buyers · not platform revenue', Icon: WalletIcon },
  ]
  const pending = stats?.pendingListings ?? 0

  return (
    <>
      <title>Admin overview · UniMarket</title>
      <AdminPageHeader
        title="Overview"
        description={`Here’s what’s happening in your campus marketplace${campus ? ` at ${CAMPUSES[campus]?.label}` : ''}.`}
        actions={
          <Button onClick={exportReport} loading={isExporting}>
            <DownloadIcon className="size-4" />
            Export report
          </Button>
        }
      />

      <div aria-live="polite" className="empty:hidden">
        {exportResult && (
          <Alert
            variant={exportResult.error ? 'danger' : exportResult.saved ? 'success' : 'warning'}
            title={exportResult.error ? 'Export failed' : exportResult.saved ? 'Report exported' : 'Preview only: no file was created'}
            className="mb-6"
          >
            {exportResult.error ?? (exportResult.saved ? 'The report was downloaded.' : 'Exporting reports needs the UniMarket backend, which isn’t connected yet.')}
          </Alert>
        )}
      </div>

      {overview.error ? (
        <ErrorState title="Couldn’t load statistics" message={overview.error.message} onRetry={overview.reload} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={overview.isLoading || undefined}>
          {overview.isLoading
            ? [1, 2, 3, 4].map((key) => <div key={key} className="h-40 animate-pulse rounded-2xl bg-subtle" />)
            : cards.map(({ key, ...card }) => <DashboardStatCard key={key} {...card} trend={overview.data.trends[key]} isSample={overview.data.isSample} />)}
        </div>
      )}

      <section aria-labelledby="management-title" className="mt-6 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id="management-title" className="text-lg font-semibold text-ink">
              Marketplace management
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">Review student accounts and keep campus listings safe.</p>
          </div>
          {pending > 0 && (
            <button
              type="button"
              onClick={() => listings.replaceParams({ moderation: 'PENDING' })}
              className="inline-flex items-center gap-1.5 rounded-control bg-warning-soft px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-warning/25"
            >
              <ClockIcon className="size-4 text-warning" />
              {pending} {pending === 1 ? 'listing' : 'listings'} awaiting review
            </button>
          )}
        </div>

        <ManagementTabs
          tab={tab}
          onChange={(value) => listings.replaceParams({ tab: value === 'users' ? 'users' : '' })}
          counts={{ products: listings.list?.counts?.all, users: users.list?.counts?.all }}
        />

        <div id="management-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="p-5">
          {tab === 'users' ? <UsersPanel list={users} /> : <ListingsPanel list={listings} caption="Marketplace listings" />}
        </div>
      </section>

      <p className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
        <span>Sample data · All times in campus local time</span>
        <span>UniMarket Admin · {new Date().getFullYear()}</span>
      </p>
    </>
  )
}
