import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import AdminSearch from '../../../components/admin/AdminSearch'
import DataTable from '../../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../../components/admin/DetailDialog'
import { BanIcon, CheckCircleIcon, EyeIcon, TrashIcon } from '../../../components/icons'
import { ModerationBadge, ProductStatusBadge } from '../../../components/product/ProductBadges'
import Alert from '../../../components/ui/Alert'
import Button from '../../../components/ui/Button'
import ErrorState from '../../../components/ui/ErrorState'
import FilterTabs from '../../../components/ui/FilterTabs'
import ImageSlot from '../../../components/ui/ImageSlot'
import LoadingState from '../../../components/ui/LoadingState'
import { LISTING_MODERATION } from '../../../constants/moderation'
import { categoryLabel, listingCode } from '../../../constants/product'
import useAdminList from '../../../hooks/useAdminList'
import useAsyncData from '../../../hooks/useAsyncData'
import { PATHS } from '../../../routes/paths'
import { adminBackendApi, adminErrorText, onAdminChanged } from '../../../services/admin/adminBackendApi'
import { formatDateTime } from '../../../utils/format'
import useTranslation from '../../../i18n/useTranslation'
import { HistoryList } from './liveAdmin'
import { money, toAdminPage } from './liveAdminFormat'
import useLiveAction from './useLiveAction'

const TABS = ['PENDING', 'APPROVED', 'BLOCKED', 'ALL']
const loadListings = (params) =>
  adminBackendApi.listings({ moderation: params.moderation || 'PENDING', q: params.q, page: params.page, size: params.pageSize }).then(toAdminPage)

/**
 * Moderation of one listing with the real API: the admin reviews the loaded version (description, photos, seller,
 * open reports, history) and approves or rejects exactly that version (409 LISTING_CHANGED if the seller edited it in
 * the meantime: the new version is loaded). Approved listings can be blocked; available / draft ones removed (soft).
 */
function ListingReview({ id, onClose }) {
  const { t } = useTranslation()
  const { data: listing, error, isLoading, reload } = useAsyncData(() => adminBackendApi.listing(id), `admin-listing-${id}`)
  const { open, dialog } = useLiveAction()

  const act = (config) => open({ ...config, onClose: reload })
  const isPending = listing?.moderation === 'PENDING'
  const canRemove = listing && ['AVAILABLE', 'DRAFT'].includes(listing.status) && listing.moderation !== 'BLOCKED'

  return (
    <DetailDialog
      title={listing?.title ?? t('Listing')}
      subtitle={listing ? `${listingCode(listing.id)} · ${t('updated {time}', { time: formatDateTime(listing.updatedAt ?? listing.createdAt) })}` : undefined}
      status={
        listing && (
          <>
            <ModerationBadge moderation={listing.moderation} audience="admin" showApproved />
            <ProductStatusBadge status={listing.status} />
          </>
        )
      }
      onClose={onClose}
      actions={
        listing && (
          <>
            {listing.moderation === 'APPROVED' && listing.status === 'AVAILABLE' && (
              <Link to={PATHS.product(listing.id)} className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-medium text-primary hover:bg-primary-soft">
                {t('Open public page')}
              </Link>
            )}
            {canRemove && (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() =>
                  act({
                    title: 'Remove this listing?',
                    message: t('“{title}” is removed from the marketplace (kept in the database for orders and audits). Use it for prohibited, fake or stolen items.', { title: listing.title }),
                    confirmLabel: 'Remove listing',
                    tone: 'danger',
                    reason: { max: 1000, label: 'Reason (recorded in the audit log)', placeholder: 'e.g. Selling prohibited items is not allowed on UniMarket.' },
                    doneText: 'The listing was removed.',
                    run: (reason) => adminBackendApi.removeListing(listing.id, reason),
                  })
                }
              >
                <TrashIcon className="size-4" />
                {t('Remove')}
              </Button>
            )}
            {listing.moderation === 'APPROVED' && (
              <Button
                variant="secondary"
                className="text-danger"
                onClick={() =>
                  act({
                    title: 'Block this listing?',
                    message: t('“{title}” will be hidden from the marketplace. The seller sees your reason and can edit the listing to send it for review again.', { title: listing.title }),
                    confirmLabel: 'Block listing',
                    tone: 'danger',
                    reason: { max: 1000, label: 'Reason for the seller', placeholder: 'e.g. The photos don’t show the actual item.' },
                    doneText: 'The listing is blocked and the seller can see why.',
                    run: (reason) => adminBackendApi.blockListing(listing.id, reason),
                  })
                }
              >
                <BanIcon className="size-4" />
                {t('Block')}
              </Button>
            )}
            {isPending && (
              <>
                <Button
                  variant="secondary"
                  className="text-danger"
                  onClick={() =>
                    act({
                      title: 'Reject this listing?',
                      message: t('“{title}” stays hidden. The seller sees your reason in My listings and can edit it to send it again.', { title: listing.title }),
                      confirmLabel: 'Reject listing',
                      tone: 'danger',
                      reason: { max: 1000, label: 'Reason for the seller', placeholder: 'e.g. The description doesn’t match the photos.', hint: '10–1000 characters. The seller sees it.' },
                      doneText: 'The listing was rejected and the seller can see why.',
                      run: (reason) => adminBackendApi.rejectListing(listing.id, listing.version, reason),
                    })
                  }
                >
                  <BanIcon className="size-4" />
                  {t('Reject')}
                </Button>
                <Button
                  onClick={() =>
                    act({
                      title: 'Approve this listing?',
                      message: t('“{title}” ({code}) becomes public if it is available. You approve the version shown here.', { title: listing.title, code: listingCode(listing.id) }),
                      confirmLabel: 'Approve listing',
                      doneText: 'The listing is approved.',
                      run: () => adminBackendApi.approveListing(listing.id, listing.version),
                    })
                  }
                >
                  <CheckCircleIcon className="size-4" />
                  {t('Approve')}
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {error ? (
        <ErrorState title={t('Couldn’t load this listing')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : isLoading ? (
        <LoadingState message={t('Loading listing…')} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {(listing.images?.length ? listing.images : [null]).map((url, index) => (
              <span key={url ?? index} className="block size-24 shrink-0 overflow-hidden rounded-card border border-line bg-subtle">
                <ImageSlot src={url} alt={t('Photo {number}', { number: index + 1 })} />
              </span>
            ))}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">{listing.description}</p>
          {listing.openReports > 0 && (
            <Alert variant="warning" title={t('{count} open report(s)', { count: listing.openReports })}>
              <Link to={`${PATHS.adminReports}?status=ACTIVE&targetType=LISTING`} className="font-semibold text-primary hover:underline">
                {t('See reports')}
              </Link>
            </Alert>
          )}
          <DetailList
            items={[
              ['Seller', listing.seller ? <Link to={PATHS.user(listing.seller.id)} className="text-primary hover:underline">{listing.seller.name}</Link> : '—'],
              ['Seller account', listing.sellerStatus],
              ['Price', money(listing.price)],
              ['Category', listing.category && categoryLabel(t(listing.category.name), listing.category.customName)],
              ['Condition', listing.condition],
              ['Listed', formatDateTime(listing.createdAt)],
            ]}
          />
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('Moderation history')}</h3>
            <HistoryList events={listing.history} />
          </section>
        </>
      )}
      {dialog}
    </DetailDialog>
  )
}

/** Admin › Products with the real API: moderation queue (PENDING oldest first), approved and blocked listings. */
export default function LiveAdminProductsPage() {
  const { t } = useTranslation()
  const list = useAdminList('live-admin-listings', loadListings, ['moderation'])
  const counts = useAsyncData(() => adminBackendApi.listingCounts(), 'live-admin-listing-counts')
  const [detailId, setDetailId] = useState(null)
  const tab = list.params.moderation || 'PENDING'
  const { reload } = list
  const reloadCounts = counts.reload
  useEffect(
    () =>
      onAdminChanged(() => {
        reload()
        reloadCounts()
      }),
    [reload, reloadCounts],
  )

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="block size-11 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
            <ImageSlot src={row.mainImageUrl} alt="" />
          </span>
          <div className="min-w-0">
            <p className="max-w-[16rem] truncate font-medium text-ink">{row.title}</p>
            <p className="text-xs text-ink-muted">{listingCode(row.id)}</p>
          </div>
        </div>
      ),
    },
    { key: 'seller', header: 'Seller', render: (row) => <span className="whitespace-nowrap text-ink">{row.seller?.name}</span> },
    { key: 'category', header: 'Category', render: (row) => <span className="whitespace-nowrap text-ink-muted">{row.category && categoryLabel(t(row.category.name), row.category.customName)}</span> },
    { key: 'price', header: 'Price', className: 'whitespace-nowrap', render: (row) => money(row.price) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <ModerationBadge moderation={row.moderation} audience="admin" showApproved />
          {row.status !== 'AVAILABLE' && <ProductStatusBadge status={row.status} />}
          {row.openReports > 0 && <span className="text-xs text-danger">{t('{count} open report(s)', { count: row.openReports })}</span>}
        </div>
      ),
    },
    { key: 'updated', header: 'Updated', className: 'whitespace-nowrap', render: (row) => formatDateTime(row.updatedAt ?? row.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant={row.moderation === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setDetailId(row.id)}>
          <EyeIcon className="size-4" />
          {row.moderation === 'PENDING' ? t('Review') : t('Details')}
        </Button>
      ),
    },
  ]

  const data = list.list
  return (
    <>
      <title>{t('Products · UniMarket Admin')}</title>
      <AdminPageHeader title={t('Products')} description={t('New and edited listings wait here until you approve them. Open a listing to review the exact version you approve or reject.')} />
      <FilterTabs
        label={t('Filter by review status')}
        value={tab}
        onChange={(value) => list.setFilter('moderation', value === 'PENDING' ? '' : value)}
        options={TABS.map((key) => ({
          value: key,
          label: key === 'ALL' ? 'All' : LISTING_MODERATION[key].label,
          count: key === 'ALL' ? undefined : counts.data?.[key],
        }))}
        className="mb-4"
      />
      <div className="mb-4 w-full xl:max-w-xs">
        <AdminSearch label={t('Search listings')} placeholder={t('Search by title or seller')} value={list.params.q} onSearch={list.setSearch} />
      </div>
      <DataTable
        caption={t('Listings')}
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error && { ...list.error, message: adminErrorText(list.error) }}
        onRetry={list.reload}
        minWidth="56rem"
        emptyTitle={tab === 'PENDING' ? t('Nothing waiting for review') : t('No listings match')}
        emptyDescription={t('Try another status or search.')}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'listings' }}
      />
      {detailId && <ListingReview id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
