import { useState } from 'react'
import { Link } from 'react-router'
import { PackageIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import { ProductStatusBadge } from '../../components/product/ProductBadges'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import ActionMenu from '../../components/ui/ActionMenu'
import Alert from '../../components/ui/Alert'
import { buttonClasses } from '../../components/ui/buttonClasses'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ImageSlot from '../../components/ui/ImageSlot'
import { CATEGORIES } from '../../constants/categories'
import { STATUSES, STATUS_KEYS, listingCode } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import { formatDate, formatPrice, formatTime } from '../../utils/format'

const TABS = [{ key: 'ALL', label: 'All' }, ...STATUS_KEYS.map((key) => ({ key, label: STATUSES[key].label }))]
const categoryName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? '—'

/** Row actions for one listing: view, edit (not for sold items), delete. */
function actionsFor(listing, onDelete) {
  return [
    { label: 'View listing', Icon: PackageIcon, to: PATHS.product(listing.id) },
    ...(listing.status !== 'SOLD' ? [{ label: 'Edit', Icon: PencilIcon, to: PATHS.editListing(listing.id) }] : []),
    { label: 'Delete', Icon: TrashIcon, danger: true, onSelect: () => onDelete(listing) },
  ]
}

function ListingThumb({ listing, className = 'size-12' }) {
  return (
    <span className={`block shrink-0 overflow-hidden rounded-lg border border-line bg-subtle ${className}`}>
      <ImageSlot src={listing.images[0]} alt="" />
    </span>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-line bg-surface p-4" aria-busy="true" aria-label="Loading listings">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4 border-b border-line py-3 last:border-0">
          <span className="size-12 rounded-lg bg-subtle" />
          <span className="h-4 flex-1 rounded-full bg-subtle" />
          <span className="h-4 w-24 rounded-full bg-subtle" />
        </div>
      ))}
    </div>
  )
}

/**
 * My Listings (approved design): status tabs + a table styled like the Figma admin "Products" table;
 * cards on small screens. Delete asks for confirmation and, until the backend exists, changes nothing.
 */
export default function MyListingsPage() {
  const { data: listings, error, isLoading, reload } = useAsyncData(() => productService.listMyListings(), 'my-listings')
  const [tab, setTab] = useState('ALL')
  const [deleting, setDeleting] = useState(null) // { listing, isWorking, result }

  const counts = Object.fromEntries(TABS.map(({ key }) => [key, key === 'ALL' ? (listings?.length ?? 0) : (listings ?? []).filter((l) => l.status === key).length]))
  const visible = (listings ?? []).filter((listing) => tab === 'ALL' || listing.status === tab)

  async function confirmDelete() {
    const { listing } = deleting
    setDeleting({ listing, isWorking: true })
    try {
      const response = await productService.deleteListing(listing.id)
      setDeleting({
        listing,
        result: response.saved
          ? { variant: 'success', title: 'Listing deleted', text: `“${listing.title}” was removed.` }
          : {
              variant: 'info',
              title: 'Preview only: nothing was deleted',
              text: 'Deleting listings needs the UniMarket backend, which isn’t connected yet. Your listing is unchanged.',
            },
      })
      if (response.saved) reload()
    } catch (deleteError) {
      setDeleting({ listing, result: { variant: 'warning', title: 'Not deleted', text: deleteError.message } })
    }
  }

  const openDelete = (listing) => setDeleting({ listing })

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load your listings" message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <TableSkeleton />
  } else if (listings.length === 0) {
    content = (
      <EmptyState
        title="You haven’t listed anything yet"
        description="Sell textbooks, tech or dorm items you no longer need. Listing is always free."
        action={
          <Link to={PATHS.sell} className={buttonClasses({ size: 'sm' })}>
            Sell an item
          </Link>
        }
      />
    )
  } else if (visible.length === 0) {
    content = <EmptyState title={`No ${STATUSES[tab].label.toLowerCase()} listings`} description="Listings with this status will show up here." />
  } else {
    content = (
      <>
        {/* Desktop: table (Figma admin dashboard style) */}
        <div className="hidden overflow-visible rounded-2xl border border-line bg-surface lg:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Your listings</caption>
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th scope="col" className="px-5 py-3 font-medium">Product</th>
                <th scope="col" className="px-4 py-3 font-medium">Category</th>
                <th scope="col" className="px-4 py-3 font-medium">Price</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Listed</th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((listing) => (
                <tr key={listing.id} className="border-t border-line">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <ListingThumb listing={listing} />
                      <div className="min-w-0">
                        <Link to={PATHS.product(listing.id)} className="font-medium text-ink hover:text-primary">
                          {listing.title}
                        </Link>
                        <p className="text-xs text-ink-muted">{listingCode(listing.id)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{categoryName(listing.categorySlug)}</td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap text-ink">{formatPrice(listing.price)}</td>
                  <td className="px-4 py-3">
                    <ProductStatusBadge status={listing.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-ink">{formatDate(listing.createdAt)}</p>
                    <p className="text-xs text-ink-muted">{formatTime(listing.createdAt)}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ActionMenu label={`Actions for ${listing.title}`} heading={`Listing ${listingCode(listing.id)}`} items={actionsFor(listing, openDelete)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile/tablet: cards */}
        <ul className="flex flex-col gap-3 lg:hidden">
          {visible.map((listing) => (
            <li key={listing.id} className="flex gap-3 rounded-card border border-line bg-surface p-3">
              <ListingThumb listing={listing} className="size-20" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <Link to={PATHS.product(listing.id)} className="line-clamp-2 text-sm font-medium text-ink hover:text-primary">
                    {listing.title}
                  </Link>
                  <ActionMenu label={`Actions for ${listing.title}`} heading={`Listing ${listingCode(listing.id)}`} items={actionsFor(listing, openDelete)} />
                </div>
                <p className="font-semibold text-ink">{formatPrice(listing.price)}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <ProductStatusBadge status={listing.status} />
                  {listingCode(listing.id)} · {formatDate(listing.createdAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>My listings · UniMarket</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My listings' }]} />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">My listings</h1>
          <p className="mt-1.5 text-ink-muted">Manage the items you’re selling on campus.</p>
        </div>
        <Link to={PATHS.sell} className={buttonClasses({ size: 'lg' })}>
          <PlusIcon className="size-5" />
          Sell an item
        </Link>
      </header>

      <SampleDataNotice className="mt-5">
        These are sample listings of a demo student. Sign-in isn’t connected yet, so they aren’t your real listings.
      </SampleDataNotice>

      <nav aria-label="Filter by status" className="mt-6 mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
              tab === key ? 'border-primary font-medium text-primary' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === key ? 'bg-primary-soft text-primary' : 'bg-subtle text-ink-muted'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </nav>

      <section aria-label={`${TABS.find((t) => t.key === tab).label} listings`}>{content}</section>

      {deleting && (
        <ConfirmDialog
          title="Delete this listing?"
          message={`“${deleting.listing.title}” will be removed from the marketplace. This can’t be undone.`}
          confirmLabel="Delete listing"
          isWorking={deleting.isWorking}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
          result={deleting.result && <Alert variant={deleting.result.variant} title={deleting.result.title}>{deleting.result.text}</Alert>}
        />
      )}
    </PageContainer>
  )
}
