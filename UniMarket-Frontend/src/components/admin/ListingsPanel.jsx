import { useState } from 'react'
import { CATEGORIES } from '../../constants/categories'
import { LISTING_MODERATION, LISTING_MODERATION_KEYS } from '../../constants/moderation'
import { CAMPUSES, STATUSES, listingCode } from '../../constants/product'
import useAdminActions from '../../hooks/useAdminActions'
import { formatDate, formatPrice, formatTime } from '../../utils/format'
import { FlagIcon } from '../icons'
import { ModerationBadge } from '../product/ProductBadges'
import ActionMenu from '../ui/ActionMenu'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Select from '../ui/Select'
import AdminSearch from './AdminSearch'
import { listingActionItems } from './adminRowActions'
import DataTable from './DataTable'
import { ListingCell, ListingDetailDialog } from './ListingAdmin'
import useTranslation from '../../i18n/useTranslation'

const LISTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]
const SORT_OPTIONS = [
  { value: '', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'price_asc', label: 'Price: low to high' },
]
const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }, ...LISTING_MODERATION_KEYS.map((key) => ({ value: key, label: LISTING_MODERATION[key].label }))]
const CATEGORY_OPTIONS = [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))]
const categoryName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? '—'

/** Seller cell (Figma): avatar, name, "FPT · campus". */
export function PersonCell({ person }) {
  if (!person) return <span className="text-ink-muted">—</span>
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={person.name} size="sm" />
      <div className="min-w-0">
        <p className="font-medium whitespace-nowrap text-ink">{person.name}</p>
        <p className="text-xs whitespace-nowrap text-ink-muted">FPT · {CAMPUSES[person.campus]?.label}</p>
      </div>
    </div>
  )
}

/**
 * Listing moderation table from the Figma admin dashboard: search, status and category filters,
 * Product · Seller · Category · Price · Status · Listed columns, row menu (details, approve, block),
 * pagination with rows per page. Used on the Overview and on Admin › Products.
 *
 * Rows can be selected for bulk approve/block (each listing is still checked on its own).
 *
 * @param {ReturnType<import('../../hooks/useAdminList').default>} list from useAdminList(…, ['moderation', 'category', 'listed', 'sort'])
 * @param {boolean} [showStatusFilter] false when the page shows status tabs instead
 */
export default function ListingsPanel({ list, caption = 'Listings', showStatusFilter = true }) {
  const { t } = useTranslation()
  const { open, dialog } = useAdminActions()
  const [detail, setDetail] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const { params, list: data } = list
  const rows = data?.items ?? []
  // Only rows on the current page can be selected; changing page or filters keeps nothing hidden selected.
  const selected = rows.filter((row) => selectedIds.has(row.id))
  const allSelected = rows.length > 0 && selected.length === rows.length

  function toggle(id) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const columns = [
    {
      key: 'select',
      header: 'Select',
      className: 'w-10',
      headerContent: (
        <input
          type="checkbox"
          aria-label={t("Select all listings on this page")}
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = selected.length > 0 && !allSelected
          }}
          onChange={() => setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
          className="size-4 cursor-pointer accent-primary"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.title}`}
          checked={selectedIds.has(row.id)}
          onChange={() => toggle(row.id)}
          className="size-4 cursor-pointer accent-primary"
        />
      ),
    },
    { key: 'product', header: 'Product', render: (row) => <ListingCell listing={row} /> },
    { key: 'seller', header: 'Seller', render: (row) => <PersonCell person={row.seller} /> },
    { key: 'category', header: 'Category', render: (row) => <span className="whitespace-nowrap text-ink-muted">{t(categoryName(row.categorySlug))}</span> },
    { key: 'price', header: 'Price', className: 'whitespace-nowrap', render: (row) => <span className="text-ink">{formatPrice(row.price)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <ModerationBadge moderation={row.moderation} audience="admin" showApproved />
          {row.status !== 'AVAILABLE' && <span className="text-xs text-ink-muted">{t(STATUSES[row.status]?.label)}</span>}
          {row.openReports > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-danger">
              <FlagIcon className="size-3" />
              {t(row.openReports > 1 ? '{count} open reports' : '{count} open report', { count: row.openReports })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'listed',
      header: 'Listed',
      className: 'whitespace-nowrap',
      render: (row) => (
        <>
          <p className="text-ink">{formatDate(row.createdAt)}</p>
          <p className="text-xs text-ink-muted">{formatTime(row.createdAt)}</p>
        </>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => <ActionMenu label={`Actions for ${row.title}`} heading={`Listing ${listingCode(row.id)}`} items={listingActionItems(row, { onDetails: setDetail, open })} />,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="w-full xl:max-w-xs">
          <AdminSearch label={t("Search listings")} placeholder={t("Search by product, seller, or listing ID")} value={params.q} onSearch={list.setSearch} />
        </div>
        <div className={`grid grid-cols-2 gap-2 xl:flex ${showStatusFilter ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {showStatusFilter && <Select label={t("Status")} hideLabel name="moderation" options={STATUS_OPTIONS} value={params.moderation} onChange={(value) => list.setFilter('moderation', value)} className="xl:w-40" />}
          <Select label={t("Category")} hideLabel name="category" options={CATEGORY_OPTIONS} value={params.category} onChange={(value) => list.setFilter('category', value)} className="xl:w-40" />
          <Select label={t("Listed")} hideLabel name="listed" options={LISTED_OPTIONS} value={params.listed} onChange={(value) => list.setFilter('listed', value)} className="xl:w-36" />
          <Select label={t("Sort by")} hideLabel name="sort" options={SORT_OPTIONS} value={params.sort} onChange={(value) => list.setFilter('sort', value)} className="xl:w-44" />
        </div>
      </div>

      {selected.length > 0 && (
        <div role="region" aria-label={t("Bulk actions")} className="flex flex-wrap items-center gap-2 rounded-control bg-primary-soft px-4 py-2.5 text-sm">
          <p className="mr-auto font-medium text-primary">
            {t('{count} selected', { count: selected.length })}
          </p>
          <Button size="sm" onClick={() => open('approveListings', { id: 'bulk', listings: selected })}>
            {t("Approve")}
          </Button>
          <Button size="sm" variant="secondary" className="text-danger" onClick={() => open('blockListings', { id: 'bulk', listings: selected })}>
            {t("Block")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            {t("Clear selection")}
          </Button>
        </div>
      )}

      <DataTable
        caption={caption}
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error}
        onRetry={list.reload}
        minWidth="56rem"
        emptyTitle={t("No listings match")}
        emptyDescription={t("Try another status, category or search.")}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'listings' }}
      />

      {detail && <ListingDetailDialog listing={detail} open={open} onClose={() => setDetail(null)} />}
      {dialog}
    </div>
  )
}
