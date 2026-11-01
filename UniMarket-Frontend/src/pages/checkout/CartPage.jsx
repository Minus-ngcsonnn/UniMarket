import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import CheckoutSteps from '../../components/checkout/CheckoutSteps'
import { ArrowLeftIcon, ArrowRightIcon, BadgeCheckIcon, LockIcon, MapPinIcon, MessageCircleIcon, ShoppingCartIcon, TrashIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import { ConditionBadge, ProductStatusBadge } from '../../components/product/ProductBadges'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ImageSlot from '../../components/ui/ImageSlot'
import LoadingState from '../../components/ui/LoadingState'
import { isPurchasable } from '../../constants/moderation'
import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useCart from '../../hooks/useCart'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import { formatPrice } from '../../utils/format'
import Avatar from '../../components/ui/Avatar'

/** Checkbox that can show "some selected" (indeterminate), for Select all / per-seller selection. */
function SelectBox({ checked, indeterminate = false, disabled, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4.5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
    />
  )
}

/** Groups cart lines by seller (Figma cart layout). */
function groupBySeller(lines) {
  const groups = new Map()
  lines.forEach((line) => {
    const key = line.product.sellerId
    if (!groups.has(key)) groups.set(key, { seller: line.product.seller, lines: [] })
    groups.get(key).lines.push(line)
  })
  return [...groups.values()]
}

/**
 * Shopping cart (Figma "shopping cart"). One unit per listing (second-hand items), so there is no
 * quantity stepper; vouchers are not part of the Business Plan, so the voucher field is left out.
 */
export default function CartPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const ids = cart.items.map((item) => item.productId)
  const { data, previousData, error, isLoading, reload } = useAsyncData(
    () => (ids.length ? productService.getProductsByIds(ids) : Promise.resolve([])),
    `cart-${ids.join(',')}`,
  )
  const products = data ?? previousData ?? []
  const currentUserId = productService.getCurrentUserId()

  // Cart lines in cart order; a line can be bought only if the listing is available and not your own.
  const lines = cart.items
    .map((item) => {
      const product = products.find((p) => p.id === item.productId)
      if (!product) return null
      const isOwn = product.sellerId === currentUserId
      const canBuy = isPurchasable(product) && !isOwn
      return { product, canBuy, isOwn, isSelected: item.selected && canBuy }
    })
    .filter(Boolean)
  const buyable = lines.filter((line) => line.canBuy)
  const selected = lines.filter((line) => line.isSelected)
  const subtotal = selected.reduce((sum, line) => sum + line.product.price, 0)
  const sellerCount = new Set(selected.map((line) => line.product.sellerId)).size
  const missingCount = isLoading ? 0 : ids.length - lines.length

  function removeLines(targetLines) {
    cart.remove(targetLines.map((line) => line.product.id))
  }

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load your cart" message={error.message} onRetry={reload} />
  } else if (cart.count === 0) {
    content = (
      <EmptyState
        icon={<ShoppingCartIcon className="size-6" />}
        title="Your cart is empty"
        description="Find textbooks, tech and dorm essentials from students on your campus."
        action={
          <Link to={PATHS.marketplace} className={buttonClasses({ size: 'sm' })}>
            Explore marketplace
          </Link>
        }
      />
    )
  } else if (isLoading && !previousData) {
    content = <LoadingState message="Loading your cart…" />
  } else {
    content = (
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-3 sm:px-5">
            <label className="flex items-center gap-3 text-sm">
              <SelectBox
                label="Select all available listings"
                checked={buyable.length > 0 && selected.length === buyable.length}
                indeterminate={selected.length > 0 && selected.length < buyable.length}
                disabled={buyable.length === 0}
                onChange={(checked) => cart.setAllSelected(checked)}
              />
              <span className="font-medium whitespace-nowrap text-ink">Select all</span>
              {/* On phones the count is in the order summary instead */}
              <span className="hidden text-ink-muted sm:inline">
                {selected.length} of {lines.length} {lines.length === 1 ? 'listing' : 'listings'} selected
              </span>
            </label>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => removeLines(selected)}
              className="text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove selected
            </button>
          </div>

          {missingCount > 0 && (
            <p role="status" className="rounded-control border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-ink">
              {missingCount === 1 ? 'One listing' : `${missingCount} listings`} in your cart no longer exist.{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => cart.remove(ids.filter((id) => !lines.some((l) => l.product.id === id)))}>
                Remove
              </button>
            </p>
          )}

          {groupBySeller(lines).map(({ seller, lines: groupLines }) => {
            const groupBuyable = groupLines.filter((line) => line.canBuy)
            const groupSelected = groupLines.filter((line) => line.isSelected)
            const groupSubtotal = groupSelected.reduce((sum, line) => sum + line.product.price, 0)
            return (
              <section key={seller?.id} aria-label={`Items from ${seller?.name}`} className="overflow-hidden rounded-card border border-line bg-surface">
                <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
                  <SelectBox
                    label={`Select all items from ${seller?.name}`}
                    checked={groupBuyable.length > 0 && groupSelected.length === groupBuyable.length}
                    indeterminate={groupSelected.length > 0 && groupSelected.length < groupBuyable.length}
                    disabled={groupBuyable.length === 0}
                    onChange={(checked) => groupBuyable.forEach((line) => cart.setSelected(line.product.id, checked))}
                  />
                  <Avatar name={seller?.name} size="sm" className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {seller?.name}
                      {seller?.verified && (
                        <>
                          <BadgeCheckIcon className="size-4 text-primary" />
                          <span className="sr-only">Verified student</span>
                        </>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{seller?.programme}</p>
                  </div>
                  <Link to={PATHS.messages} className="hidden items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:flex">
                    <MessageCircleIcon className="size-4" />
                    Message seller
                  </Link>
                </header>

                <ul>
                  {groupLines.map(({ product, canBuy, isOwn, isSelected }) => (
                    <li key={product.id} className="flex gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:gap-4 sm:px-5">
                      <div className="pt-1">
                        <SelectBox
                          label={`Select ${product.title}`}
                          checked={isSelected}
                          disabled={!canBuy}
                          onChange={(checked) => cart.setSelected(product.id, checked)}
                        />
                      </div>
                      <Link to={PATHS.product(product.id)} tabIndex={-1} aria-hidden="true" className="block size-20 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle sm:size-22">
                        <ImageSlot src={product.images[0]} alt="" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Link to={PATHS.product(product.id)} className="line-clamp-2 font-semibold text-ink hover:text-primary">
                            {product.title}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2">
                            <ConditionBadge condition={product.condition} />
                            {!canBuy &&
                              (isOwn ? (
                                <span className="text-xs text-ink-muted">Your own listing</span>
                              ) : product.status === 'AVAILABLE' ? (
                                <span className="text-xs text-ink-muted">Unavailable</span>
                              ) : (
                                <ProductStatusBadge status={product.status} />
                              ))}
                          </div>
                          {!canBuy && <p className="text-xs text-ink-muted">{isOwn ? 'You can’t buy your own listing.' : 'No longer available, so it can’t be checked out.'}</p>}
                        </div>
                        <p className={`font-semibold whitespace-nowrap sm:text-right ${canBuy ? 'text-ink' : 'text-ink-muted line-through'}`}>{formatPrice(product.price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.remove(product.id)}
                        aria-label={`Remove ${product.title} from cart`}
                        className="flex size-8 shrink-0 items-center justify-center self-start rounded-control text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>

                <footer className="flex flex-wrap items-center justify-between gap-2 bg-subtle/70 px-4 py-3 text-xs sm:px-5">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <MapPinIcon className="size-4 text-primary" />
                    {UNIVERSITY_NAME} · {CAMPUSES[seller?.campus]?.label} · Delivery arranged by seller
                  </span>
                  <span className="text-ink-muted">
                    Selected subtotal <span className="ml-1 text-sm font-semibold text-ink">{formatPrice(groupSubtotal)}</span>
                  </span>
                </footer>
              </section>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={PATHS.marketplace} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
              <ArrowLeftIcon className="size-4" />
              Continue shopping
            </Link>
            <p className="text-xs text-ink-muted">Unselected items stay in your cart.</p>
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
          <section aria-labelledby="summary-title" className="rounded-card border border-line bg-surface p-5 sm:p-6">
            <h2 id="summary-title" className="text-xl font-bold text-ink">
              Order summary
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {selected.length} selected {selected.length === 1 ? 'listing' : 'listings'} · {sellerCount} {sellerCount === 1 ? 'seller' : 'sellers'}
            </p>
            {sellerCount > 1 && <p className="mt-1 text-xs text-ink-muted">Checkout creates one order per seller.</p>}
            <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="font-medium text-ink">{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Delivery</dt>
                <dd className="text-right text-ink">Arranged by seller</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-control bg-primary-soft px-3 py-2.5 text-xs text-primary">
              You pay online after each seller confirms your order. Nothing is charged now.
            </p>
            <div className="mt-5 flex items-end justify-between border-t border-line pt-5">
              <span className="font-semibold text-ink">Total</span>
              <span className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{formatPrice(subtotal)}</span>
            </div>
            <Button size="lg" fullWidth className="mt-5" disabled={selected.length === 0} onClick={() => navigate(PATHS.checkout(selected.map((line) => line.product.id)))}>
              Proceed to Checkout
              <ArrowRightIcon className="size-4.5" />
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
              <LockIcon className="size-3.5" />
              Secure checkout. No charge until the seller confirms.
            </p>
          </section>

          <div className="flex gap-3 p-1">
            <BadgeCheckIcon className="size-6 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-semibold text-ink">Your campus. Your community.</p>
              <p className="mt-1 text-ink-muted">Sellers are verified students. Each one confirms your order within 24 hours, then you pay securely on UniMarket.</p>
              <Link to={PATHS.howItWorks} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                How buying works →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>Shopping cart · UniMarket</title>
      <Breadcrumbs items={[{ label: 'Marketplace', to: PATHS.marketplace }, { label: 'Shopping cart' }]} />

      <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">
            Your shopping cart
            {cart.count > 0 && (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold tracking-normal text-primary">
                {cart.count} {cart.count === 1 ? 'listing' : 'listings'}
              </span>
            )}
          </h1>
          <p className="mt-1.5 text-ink-muted">Good finds from your campus. One step closer to their next chapter.</p>
        </div>
        <CheckoutSteps current="Cart" />
      </header>

      <SampleDataNotice className="mb-5">Prices and availability come from sample listings. Your cart is saved in this browser only.</SampleDataNotice>
      {content}
    </PageContainer>
  )
}
