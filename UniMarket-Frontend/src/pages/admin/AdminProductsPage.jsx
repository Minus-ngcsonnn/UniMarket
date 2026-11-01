import { useState } from 'react'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminSearch from '../../components/admin/AdminSearch'
import { listingActionItems } from '../../components/admin/adminRowActions'
import DataTable from '../../components/admin/DataTable'
import { ListingCell, ListingDetailDialog } from '../../components/admin/ListingAdmin'
import useAdminActions from '../../hooks/useAdminActions'
import { FlagIcon } from '../../components/icons'
import { ModerationBadge, ProductStatusBadge } from '../../components/product/ProductBadges'
import ActionMenu from '../../components/ui/ActionMenu'
import FilterTabs from '../../components/ui/FilterTabs'
import Select from '../../components/ui/Select'
import { CATEGORIES } from '../../constants/categories'
import { LISTING_MODERATION, LISTING_MODERATION_KEYS } from '../../constants/moderation'
import { listingCode } from '../../constants/product'
import useAdminList from '../../hooks/useAdminList'
import { adminService } from '../../services/admin/adminService'
import { formatPrice, formatRelativeTime } from '../../utils/format'

const CATEGORY_OPTIONS = [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))]

/** Admin › Products: listing moderation (Figma "Products" with Pending/Active/Blocked). */
export default function AdminProductsPage() {
  const list = useAdminList('admin-listings', adminService.listListings, ['moderation', 'category'])
  const { open, dialog } = useAdminActions()
  const [detail, setDetail] = useState(null)
  const { params, list: data } = list
  const counts = data?.counts ?? {}

  const columns = [
    { key: 'product', header: 'Product', render: (row) => <ListingCell listing={row} /> },
    { key: 'seller', header: 'Seller', render: (row) => <span className="text-ink">{row.seller?.name}</span> },
    { key: 'price', header: 'Price', className: 'whitespace-nowrap', render: (row) => <span className="font-medium text-ink">{formatPrice(row.price)}</span> },
    { key: 'review', header: 'Review', render: (row) => <ModerationBadge moderation={row.moderation} audience="admin" showApproved /> },
    { key: 'sale', header: 'Sale status', render: (row) => <ProductStatusBadge status={row.status} /> },
    {
      key: 'reports',
      header: 'Reports',
      render: (row) =>
        row.openReports > 0 ? (
          <span className="inline-flex items-center gap-1 text-danger">
            <FlagIcon className="size-3.5" />
            {row.openReports} open
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    { key: 'listed', header: 'Listed', className: 'whitespace-nowrap', render: (row) => <span className="text-ink-muted">{formatRelativeTime(row.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => <ActionMenu label={`Actions for ${row.title}`} heading={`Listing ${listingCode(row.id)}`} items={listingActionItems(row, { onDetails: setDetail, open })} />,
    },
  ]

  return (
    <>
      <title>Products · UniMarket Admin</title>
      <AdminPageHeader title="Products" description="New and edited listings wait here until you approve them. Blocked listings are hidden from the marketplace." />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          label="Filter by review status"
          value={params.moderation}
          onChange={(value) => list.setFilter('moderation', value)}
          options={[{ value: '', label: 'All', count: counts.all }, ...LISTING_MODERATION_KEYS.map((key) => ({ value: key, label: LISTING_MODERATION[key].label, count: counts[key] }))]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <AdminSearch label="Search listings" placeholder="Title, UM code or seller" value={params.q} onSearch={list.setSearch} />
          <Select label="Category" hideLabel name="category" options={CATEGORY_OPTIONS} value={params.category} onChange={(value) => list.setFilter('category', value)} className="sm:w-44" />
        </div>
      </div>

      <DataTable
        caption="Listings"
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error}
        onRetry={list.reload}
        emptyTitle="No listings match"
        emptyDescription="Try another status, category or search."
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'listings' }}
      />

      {detail && <ListingDetailDialog listing={detail} open={open} onClose={() => setDetail(null)} />}
      {dialog}
    </>
  )
}
