import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FlagIcon, PencilIcon, ShoppingCartIcon } from '../../components/icons'
import SaveItemButton from '../../components/product/SaveItemButton'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ReportDialog from '../../components/moderation/ReportDialog'
import { ConditionBadge, ModerationBadge, ProductStatusBadge } from '../../components/product/ProductBadges'
import ProductGrid from '../../components/product/ProductGrid'
import ProductImageGallery from '../../components/product/ProductImageGallery'
import SafetyNote from '../../components/product/SafetyNote'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import SellerCard from '../../components/product/SellerCard'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { CATEGORIES } from '../../constants/categories'
import { isPubliclyListed } from '../../constants/moderation'
import { CAMPUSES, CONDITIONS, UNIVERSITY_NAME, listingCode } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useCart from '../../hooks/useCart'
import { PATHS, marketplaceUrl } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import { formatDate, formatPrice, formatRelativeTime } from '../../utils/format'

/** Feedback after an action on this page. */
const NOTICES = {
  added: { variant: 'success', title: 'Added to your cart', text: 'You can keep browsing or check out when you’re ready.', cartLink: true },
  already: { variant: 'info', title: 'Already in your cart', text: 'Each listing is a single item, so it can only be added once.', cartLink: true },
  message: { variant: 'info', title: 'Messaging isn’t available yet', text: 'You’ll be able to message sellers in a later version. Order updates appear in My orders.' },
}

const STATUS_MESSAGES = {
  RESERVED: { variant: 'warning', title: 'Reserved', text: 'Another student is buying this item. It becomes available again if their order is cancelled.' },
  SOLD: { variant: 'info', title: 'Sold', text: 'This item has already been sold. Have a look at similar items below.' },
}

function DetailSkeleton() {
  return (
    <div className="mt-6 grid animate-pulse gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12" aria-busy="true" aria-label="Loading listing">
      <div className="aspect-[4/3] rounded-2xl bg-subtle" />
      <div className="flex flex-col gap-4">
        <div className="h-5 w-32 rounded-full bg-subtle" />
        <div className="h-8 w-4/5 rounded-full bg-subtle" />
        <div className="h-4 w-1/2 rounded-full bg-subtle" />
        <div className="h-10 w-1/3 rounded-full bg-subtle" />
        <div className="h-12 rounded-control bg-subtle" />
        <div className="h-32 rounded-card bg-subtle" />
      </div>
    </div>
  )
}

/** Product Detail (approved two-column layout; not part of the Figma file). */
export default function ProductDetailPage() {
  const { id } = useParams()
  const { data: product, error, isLoading, reload } = useAsyncData(() => productService.getProduct(id), `product-${id}`)
  const category = CATEGORIES.find((c) => c.slug === product?.categorySlug)
  const related = useAsyncData(
    () => (product ? productService.listProducts({ category: product.categorySlug, pageSize: 5 }) : Promise.resolve(null)),
    `related-${product?.id ?? 'none'}`,
  )
  const [noticeKey, setNoticeKey] = useState(null)
  const [isReporting, setIsReporting] = useState(false)
  const noticeRef = useRef(null)
  const navigate = useNavigate()
  const cart = useCart()

  /** Shows feedback and brings it into view (e.g. when triggered from the mobile bottom bar). */
  function showNotice(key) {
    setNoticeKey(key)
    setTimeout(() => noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }

  function addToCart() {
    showNotice(cart.add(product.id) ? 'added' : 'already')
  }

  if (error) {
    return (
      <PageContainer className="py-10">
        <ErrorState title="Couldn’t load this listing" message={error.message} onRetry={reload} />
      </PageContainer>
    )
  }

  if (isLoading) {
    return (
      <PageContainer className="py-6 sm:py-8">
        <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'Explore marketplace', to: PATHS.marketplace }, { label: 'Loading…' }]} />
        <DetailSkeleton />
      </PageContainer>
    )
  }

  if (!product) {
    return (
      <PageContainer width="md" className="py-16">
        <title>Listing not found · UniMarket</title>
        <EmptyState
          titleAs="h1"
          title="Listing not found"
          description="This listing may have been removed, or the link is not correct."
          action={
            <Link to={PATHS.marketplace} className={buttonClasses({ variant: 'secondary' })}>
              Back to marketplace
            </Link>
          }
        />
      </PageContainer>
    )
  }

  const isAvailable = product.status === 'AVAILABLE' && isPubliclyListed(product)
  const statusMessage = STATUS_MESSAGES[product.status]
  const savings = product.originalPrice > product.price ? Math.round((1 - product.price / product.originalPrice) * 100) : 0
  const relatedItems = (related.data?.items ?? []).filter((item) => item.id !== product.id).slice(0, 4)
  const notice = NOTICES[noticeKey]
  const isOwnListing = product.sellerId === productService.getCurrentUserId()
  const canBuy = isAvailable && !isOwnListing

  const details = [
    ['Category', category?.name],
    ['Condition', CONDITIONS[product.condition]?.label],
    ['Campus', `${UNIVERSITY_NAME} · ${CAMPUSES[product.campus]?.label}`],
    ['Listed on', formatDate(product.createdAt)],
    ['Listing ID', listingCode(product.id)],
  ]

  return (
    <PageContainer className={`py-6 sm:py-8 ${canBuy ? 'pb-28 lg:pb-8' : ''}`}>
      <title>{`${product.title} · UniMarket`}</title>

      <Breadcrumbs
        items={[
          { label: 'Home', to: PATHS.home },
          { label: 'Explore marketplace', to: PATHS.marketplace },
          ...(category ? [{ label: category.name, to: marketplaceUrl({ category: category.slug }) }] : []),
          { label: product.title },
        ]}
      />

      <SampleDataNotice className="mt-5" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-x-12 lg:[grid-template-areas:'gallery_info'_'about_info']">
        <div className="lg:[grid-area:gallery]">
          <ProductImageGallery images={product.images} title={product.title} />
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-36 lg:self-start lg:[grid-area:info]">
          <div className="flex flex-wrap items-center gap-2">
            <ConditionBadge condition={product.condition} className="text-xs" />
            <ProductStatusBadge status={product.status} />
            <ModerationBadge moderation={product.moderation} />
          </div>

          <div>
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink sm:text-3xl">{product.title}</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {category?.name} · Listed {formatRelativeTime(product.createdAt).toLowerCase()} · {listingCode(product.id)}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl tracking-tight text-ink sm:text-[2.25rem]">{formatPrice(product.price)}</p>
            {savings > 0 && (
              <>
                <s className="text-sm text-ink-muted">{formatPrice(product.originalPrice)}</s>
                <span className="rounded bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">−{savings}%</span>
              </>
            )}
          </div>

          {statusMessage && (
            <Alert variant={statusMessage.variant} title={statusMessage.title}>
              {statusMessage.text}
            </Alert>
          )}

          {isOwnListing ? (
            <div className="flex flex-col gap-3 rounded-card border border-primary/20 bg-primary-soft p-4">
              <p className="text-sm text-ink">
                <span className="font-semibold">This is your listing.</span>{' '}
                {product.moderation === 'PENDING'
                  ? 'It’s waiting for an admin to check it. Buyers can’t see it until it’s approved.'
                  : product.moderation === 'BLOCKED'
                    ? `An admin blocked it, so buyers can’t see it${product.moderationNote ? `: “${product.moderationNote}”` : '.'} Edit it to send it for review again.`
                    : 'Buyers see it exactly like this.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {product.status !== 'SOLD' && (
                  <Link to={PATHS.editListing(product.id)} className={buttonClasses({ size: 'sm' })}>
                    <PencilIcon className="size-4" />
                    Edit listing
                  </Link>
                )}
                <Link to={PATHS.myListings} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                  Manage my listings
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" disabled={!canBuy} onClick={addToCart}>
                <ShoppingCartIcon className="size-5" />
                {cart.has(product.id) ? 'In your cart' : 'Add to cart'}
              </Button>
              <Button variant="secondary" size="lg" className="flex-1" disabled={!canBuy} onClick={() => navigate(PATHS.checkout(product.id))}>
                Buy now
              </Button>
              <SaveItemButton productId={product.id} title={product.title} variant="detail" className="relative shrink-0" />
            </div>
          )}

          <div ref={noticeRef} className="scroll-mt-32 empty:hidden">
            {notice && (
              <Alert variant={notice.variant} title={notice.title}>
                {notice.text}{' '}
                {notice.cartLink && (
                  <Link to={PATHS.cart} className="font-semibold text-primary hover:underline">
                    View cart →
                  </Link>
                )}
              </Alert>
            )}
          </div>

          <SellerCard seller={product.seller} onMessage={isOwnListing ? undefined : () => showNotice('message')} />

          {!isOwnListing && (
            <button
              type="button"
              onClick={() => setIsReporting(true)}
              className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-danger"
            >
              <FlagIcon className="size-4" />
              Report this listing
            </button>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-line bg-surface p-4 text-sm sm:p-5">
            {details.map(([term, value]) => (
              <div key={term} className="min-w-0">
                <dt className="text-xs text-ink-muted">{term}</dt>
                <dd className="mt-0.5 font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-5 lg:[grid-area:about]">
          <section aria-labelledby="description-title">
            <h2 id="description-title" className="text-lg font-bold text-ink">
              Description
            </h2>
            <p className="mt-2 leading-relaxed whitespace-pre-line text-ink-muted">{product.description}</p>
          </section>
          <SafetyNote variant="inline" />
        </div>
      </div>

      {relatedItems.length > 0 && category && (
        <section aria-labelledby="related-title" className="mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <h2 id="related-title" className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              More in {category.name}
            </h2>
            <Link to={marketplaceUrl({ category: category.slug })} className="text-sm font-semibold text-primary hover:underline">
              View all →
            </Link>
          </div>
          <ProductGrid products={relatedItems} layout="wide" label={`More in ${category.name}`} />
        </section>
      )}

      {/* Mobile: price and main action stay reachable at the bottom of the screen */}
      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <p className="flex-1 truncate text-lg font-semibold text-ink">{formatPrice(product.price)}</p>
            <Button variant="secondary" onClick={addToCart} aria-label={cart.has(product.id) ? 'In your cart' : 'Add to cart'}>
              <ShoppingCartIcon className="size-4" />
            </Button>
            <Button onClick={() => navigate(PATHS.checkout(product.id))}>Buy now</Button>
          </div>
        </div>
      )}
      {isReporting && <ReportDialog target={{ type: 'LISTING', id: product.id, label: product.title }} onClose={() => setIsReporting(false)} />}
    </PageContainer>
  )
}
