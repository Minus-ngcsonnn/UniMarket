import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRightIcon, PackageIcon, PlusIcon, StarIcon, StoreIcon, TagIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { ModerationBadge, ProductStatusBadge } from '../../components/product/ProductBadges'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import RatingStars from '../../components/reviews/RatingStars'
import ReviewCard from '../../components/reviews/ReviewCard'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import FilterTabs from '../../components/ui/FilterTabs'
import ImageSlot from '../../components/ui/ImageSlot'
import { NEEDS_ACTION, orderCode } from '../../constants/order'
import { listingCode } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useLiveOrders from '../../hooks/useLiveOrders'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { accountService } from '../../services/account/accountService'
import { orderService } from '../../services/orders/orderService'
import { productService } from '../../services/products/productService'
import { formatPrice, formatRelativeTime } from '../../utils/format'

const LISTING_TABS = [
  { value: 'active', label: 'Active', match: (l) => l.status !== 'SOLD' && (l.moderation ?? 'APPROVED') === 'APPROVED' },
  { value: 'attention', label: 'Pending or blocked', match: (l) => l.status !== 'SOLD' && (l.moderation ?? 'APPROVED') !== 'APPROVED' },
  { value: 'sold', label: 'Sold', match: (l) => l.status === 'SOLD' },
]

/** One summary number; the whole card links to where the student can act on it. */
function SummaryCard({ label, value, hint, to, Icon }) {
  return (
    <Link to={to} className="group flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary/40">
      <span className="flex items-center justify-between gap-2 text-sm text-ink-muted">
        {label}
        <Icon className="size-4.5 text-primary" />
      </span>
      <span className="text-xl font-semibold sm:text-2xl tracking-tight text-ink tabular-nums">{value}</span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </Link>
  )
}

function Section({ id, title, action, children }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const sectionLink = 'inline-flex min-h-6 items-center gap-1 py-1 text-sm font-semibold text-primary hover:underline'

/**
 * Shop dashboard (Stage 4): the selling side of the student's single account. Everything shown is
 * counted from the student's own listings, sales orders and reviews; nothing is estimated.
 */
export default function ShopDashboardPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('active')
  const profile = useAsyncData(() => accountService.getMyProfile(), 'shop-profile')
  const listings = useAsyncData(() => productService.listMyListings(), 'shop-listings')
  const sales = useLiveOrders(() => orderService.listOrders('seller'), 'shop-sales')
  const reviews = useAsyncData(
    () => (profile.data ? accountService.listUserReviews(profile.data.id, { role: 'BUYER' }) : Promise.resolve([])),
    `shop-reviews-${profile.data?.id ?? 'none'}`,
  )

  const myListings = listings.data ?? []
  const toHandle = (sales.data ?? []).filter((order) => NEEDS_ACTION.seller.includes(order.status))
  const counts = Object.fromEntries(LISTING_TABS.map((item) => [item.value, myListings.filter(item.match).length]))
  const visibleListings = myListings.filter(LISTING_TABS.find((item) => item.value === tab).match)
  const rating = profile.data?.rating

  const error = profile.error ?? listings.error ?? sales.error
  const isLoading = profile.isLoading || listings.isLoading || sales.isLoading

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load your shop" message={error.message} onRetry={() => [profile, listings, sales].forEach((q) => q.reload())} />
  } else if (isLoading) {
    content = (
      <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label={t('Loading your shop')}>
        {[1, 2, 3, 4].map((key) => (
          <div key={key} className="h-28 rounded-card bg-subtle" />
        ))}
      </div>
    )
  } else {
    content = (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label={t('Active listings')} value={counts.active} hint={t('Visible in the marketplace')} to={PATHS.myListings} Icon={TagIcon} />
          <SummaryCard label={t('Pending or blocked')} value={counts.attention} hint={t('Waiting for an admin or need changes')} to={PATHS.myListings} Icon={StoreIcon} />
          <SummaryCard label={t('Orders to handle')} value={toHandle.length} hint={t('Confirm new orders and deliver paid ones')} to={PATHS.sales} Icon={PackageIcon} />
          <SummaryCard
            label={t('Seller rating')}
            value={rating?.count ? rating.average.toFixed(1) : '–'}
            hint={rating?.count ? t(rating.count === 1 ? '{count} review' : '{count} reviews', { count: rating.count }) : t('No reviews yet')}
            to={profile.data ? PATHS.user(profile.data.id) : PATHS.profile}
            Icon={StarIcon}
          />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Section
              id="orders-title"
              title={t('Orders to handle')}
              action={
                <Link to={PATHS.sales} className={sectionLink}>
                  {t('All sales')}
                  <ArrowRightIcon className="size-4" />
                </Link>
              }
            >
              {toHandle.length === 0 ? (
                <p className="rounded-control bg-subtle px-4 py-3 text-sm text-ink-muted">{t('Nothing to do right now. New orders will appear here.')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {toHandle.map((order) => (
                    <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                        <p className="text-sm font-semibold text-ink">{t('Order {code}', { code: orderCode(order.id) })}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {order.buyer?.name} · {t(order.items.length === 1 ? '{count} item' : '{count} items', { count: order.items.length })} · {formatPrice(order.amount)}
                        </p>
                      </div>
                      <span className="mr-auto sm:mr-0">
                        <OrderStatusBadge status={order.status} />
                      </span>
                      <Link to={PATHS.order(order.id)} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
                        {t('Open')}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              id="listings-title"
              title={t('Your listings')}
              action={
                <Link to={PATHS.myListings} className={sectionLink}>
                  {t('Manage my listings')}
                  <ArrowRightIcon className="size-4" />
                </Link>
              }
            >
              <FilterTabs
                label={t('Filter listings')}
                value={tab}
                onChange={setTab}
                options={LISTING_TABS.map((item) => ({ value: item.value, label: item.label, count: counts[item.value] }))}
                className="mb-4"
              />
              {visibleListings.length === 0 ? (
                <EmptyState
                  icon={<TagIcon className="size-6" />}
                  title={tab === 'sold' ? 'No sold items yet' : tab === 'attention' ? 'Nothing waiting for review' : 'No active listings'}
                  description={tab === 'active' ? 'Listing is free. Add something you no longer need.' : undefined}
                  action={
                    tab === 'active' ? (
                      <Link to={PATHS.sell} className={buttonClasses({ size: 'sm' })}>
                        {t('Sell an item')}
                      </Link>
                    ) : undefined
                  }
                  className="py-8"
                />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {visibleListings.map((listing) => (
                    <li key={listing.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="block size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
                        <ImageSlot src={listing.images[0]} alt="" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link to={PATHS.product(listing.id)} className="line-clamp-1 text-sm font-medium text-ink hover:text-primary">
                          {listing.title}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          {listingCode(listing.id)} · {formatRelativeTime(listing.createdAt)}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-ink sm:hidden">{formatPrice(listing.price)}</p>
                      </div>
                      <div className="hidden flex-col items-end gap-1 sm:flex">
                        <span className="text-sm font-semibold text-ink">{formatPrice(listing.price)}</span>
                        <span className="flex gap-1">
                          <ProductStatusBadge status={listing.status} />
                          <ModerationBadge moderation={listing.moderation} />
                        </span>
                      </div>
                      {listing.status !== 'SOLD' && (
                        <Link to={PATHS.editListing(listing.id)} className={buttonClasses({ size: 'sm', variant: 'ghost' })}>
                          {t('Edit')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section
            id="reviews-title"
            title={t('Reviews from buyers')}
            action={
              profile.data && (
                <Link to={PATHS.user(profile.data.id)} className={sectionLink}>
                  {t('Public profile')}
                  <ArrowRightIcon className="size-4" />
                </Link>
              )
            }
          >
            {rating?.count > 0 && (
              <p className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
                <RatingStars value={rating.average} />
                <span className="font-semibold text-ink">{rating.average.toFixed(1)}</span>
                {t(rating.count === 1 ? '{count} review' : '{count} reviews', { count: rating.count })}
              </p>
            )}
            {reviews.error ? (
              <ErrorState title="Couldn’t load reviews" message={reviews.error.message} onRetry={reviews.reload} />
            ) : (reviews.data ?? []).length === 0 ? (
              <p className="rounded-control bg-subtle px-4 py-3 text-sm text-ink-muted">{t('Buyers can review you after an order is completed.')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {reviews.data.slice(0, 3).map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t('Shop dashboard · UniMarket')}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'Shop dashboard' }]} />
      <header className="mt-4 mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t('Shop dashboard')}</h1>
          <p className="mt-1.5 text-ink-muted">{t('Everything you sell, in one place: listings, orders to handle and what buyers say.')}</p>
        </div>
        <Link to={PATHS.sell} className={buttonClasses({ size: 'lg' })}>
          <PlusIcon className="size-5" />
          {t('Sell an item')}
        </Link>
      </header>
      <SampleDataNotice className="mb-6">{t('You’re seeing the shop of a demo student. Sign-in isn’t connected yet.')}</SampleDataNotice>
      {content}
    </PageContainer>
  )
}
