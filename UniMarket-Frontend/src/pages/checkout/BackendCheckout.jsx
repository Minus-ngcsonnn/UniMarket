import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRightIcon, ClockIcon, LockIcon, MapPinIcon, PackageIcon, ShieldCheckIcon, UserIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ImageSlot from '../../components/ui/ImageSlot'
import Input from '../../components/ui/Input'
import LoadingState from '../../components/ui/LoadingState'
import Select from '../../components/ui/Select'
import { isPurchasable } from '../../constants/moderation'
import { SELLER_CONFIRM_HOURS } from '../../constants/order'
import useAsyncData from '../../hooks/useAsyncData'
import useCart from '../../hooks/useCart'
import useCatalogReference from '../../hooks/useCatalogReference'
import useForm from '../../hooks/useForm'
import useSession from '../../hooks/useSession'
import { PATHS } from '../../routes/paths'
import { checkoutTotals, defaultCarriers, existingOrderIds, shippingChoices } from '../../services/orders/orderMapper'
import { orderService } from '../../services/orders/orderService'
import { productService } from '../../services/products/productService'
import { describeApiError } from '../../utils/apiErrorMessage'
import { validateBackendDelivery } from '../../utils/checkoutValidation'
import { formatDateTime, formatPrice } from '../../utils/format'
import useTranslation from '../../i18n/useTranslation'

const NEXT_STEPS = [
  `Each seller confirms your order within ${SELLER_CONFIRM_HOURS} hours.`,
  'Then you pay each order online within 24 hours (simulated payment: MoMo, ZaloPay or bank QR; no money is charged).',
  'The seller hands the order to the simulated delivery after your payment.',
  'You confirm you’ve received it, and the order is complete.',
]

function Section({ title, icon: Icon, children }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Icon className="size-5 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Seconds left until an ISO time (updates every second while counting). */
function useSecondsLeft(iso) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [iso])
  return iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) : null
}

/** [{ sellerId, seller, products }] in the order the sellers first appear. */
function groupBySeller(products) {
  const groups = new Map()
  products.forEach((product) => {
    if (!groups.has(product.sellerId)) groups.set(product.sellerId, { sellerId: product.sellerId, seller: product.seller, products: [] })
    groups.get(product.sellerId).products.push(product)
  })
  return [...groups.values()]
}

const UNAVAILABLE_REASONS = {
  OUT_OF_RANGE: 'This seller is too far from your delivery area for every simulated carrier.',
  NO_PICKUP_AREA: 'This seller has not set a pickup area, so delivery can’t be estimated.',
}

/**
 * Checkout with the real API (Stage 6.3, V003). The buyer chooses a delivery area; the backend quotes simulated
 * delivery per seller (POST /api/shipping/quotes, signed tokens valid 15 minutes); the buyer picks a carrier per seller;
 * POST /api/checkout creates one order per seller in one transaction. React never calculates an authoritative fee:
 * the request carries only quote tokens and the backend recomputes everything.
 * Items come from ?items=<ids>: the selected cart lines, or one listing for "Buy now" (the cart is not used).
 */
export default function BackendCheckout({ ids }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cart = useCart()
  const auth = useSession()
  const { reference } = useCatalogReference()
  const [zoneId, setZoneId] = useState(() => (auth.user?.homeZone?.id != null ? String(auth.user.homeZone.id) : ''))
  const [picked, setPicked] = useState({}) // carrier the buyer clicked, per seller
  const [quoteAttempt, setQuoteAttempt] = useState(0)
  const [submitError, setSubmitError] = useState(null) // { title, text, orderIds?, uncertain? }

  const { data: products, error, isLoading, reload } = useAsyncData(
    () => (ids.length ? productService.getProductsByIds(ids) : Promise.resolve([])),
    `checkout-${ids.join(',')}`,
  )
  const currentUserId = productService.getCurrentUserId()
  const items = (products ?? []).filter((p) => isPurchasable(p) && p.sellerId !== currentUserId)
  const unavailable = (products ?? []).filter((p) => !items.includes(p))
  const missing = products ? ids.filter((id) => !products.some((p) => p.id === id)).length : 0
  const itemIds = items.map((p) => p.id)
  const sellerGroups = groupBySeller(items)

  const quote = useAsyncData(
    () => (zoneId && itemIds.length ? orderService.quoteShipping(itemIds, zoneId) : Promise.resolve(null)),
    `quote-${zoneId}-${itemIds.join(',')}-${quoteAttempt}`,
  )
  const quoteData = quote.data ?? null
  const secondsLeft = useSecondsLeft(quoteData?.expiresAt)
  const quoteExpired = secondsLeft === 0
  // Chosen carrier per seller: the buyer's click if the current quote still offers it, else the cheapest option.
  const defaults = defaultCarriers(quoteData)
  const carriers = Object.fromEntries(
    (quoteData?.groups ?? []).map((group) => {
      const kept = group.options.find((o) => o.carrier === picked[group.sellerId] && o.available && o.quoteToken)
      return [group.sellerId, kept ? kept.carrier : defaults[group.sellerId]]
    }),
  )

  const totals = checkoutTotals(items, quoteData, carriers)
  const blockedGroups = (quoteData?.groups ?? []).filter((group) => !group.available)
  const canSubmit = Boolean(quoteData) && totals.complete && !quoteExpired && blockedGroups.length === 0 && !submitError?.uncertain

  function requote() {
    setSubmitError(null)
    setQuoteAttempt((n) => n + 1)
  }

  const form = useForm({
    initialValues: { fullName: auth.user?.fullName ?? '', phone: '', address: '' },
    validate: validateBackendDelivery,
    onSubmit: async (values) => {
      setSubmitError(null)
      if (!canSubmit) return
      try {
        const { orders } = await orderService.checkout({
          productIds: itemIds,
          recipientName: values.fullName.trim(),
          recipientPhone: values.phone.trim(),
          deliveryAddress: values.address.trim(),
          deliveryZoneId: Number(zoneId),
          shipping: shippingChoices(quoteData, carriers),
          expectedPrices: Object.fromEntries(items.map((p) => [p.id, p.price])),
        })
        cart.refresh() // ordered listings were removed from the cart by the server
        navigate(PATHS.orderConfirmation(orders.map((o) => o.id)), { replace: true })
      } catch (checkoutError) {
        setSubmitError(describeCheckoutError(checkoutError))
        if (['SHIPPING_QUOTE_CHANGED', 'SHIPPING_QUOTE_INVALID'].includes(checkoutError?.code)) setQuoteAttempt((n) => n + 1)
        if (['LISTING_UNAVAILABLE', 'PRICE_CHANGED', 'OWN_LISTING'].includes(checkoutError?.code)) reload()
      }
    },
  })

  if (error) return <ErrorState title={t("Couldn’t load checkout")} message={describeApiError(error).message} onRetry={reload} />
  if (isLoading) return <LoadingState message={t("Preparing checkout…")} />
  if (items.length === 0) {
    return (
      <EmptyState
        title={t("Nothing to check out")}
        description={unavailable.length || missing ? t('The selected listings are no longer available.') : t('Choose items in your cart, or use “Buy now” on a listing.')}
        action={
          <Link to={PATHS.cart} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t("Back to cart")}
          </Link>
        }
      />
    )
  }

  const zoneOptions = reference.zones.map((zone) => ({ value: String(zone.id), label: `${zone.name} — ${zone.province}` }))

  return (
    <form noValidate onSubmit={form.handleSubmit} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-5">
        {(unavailable.length > 0 || missing > 0) && (
          <Alert variant="warning" title={t("Some items were removed from this order")}>
            {t('{count} selected listing(s) are no longer available and were left out.', { count: unavailable.length + missing })}
          </Alert>
        )}

        <Section title={t("Delivery details")} icon={MapPinIcon}>
          <p className="-mt-2 text-sm text-ink-muted">
            {t('The seller sees these details only after you have paid, to hand over the order.')}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label={t("Full name")} autoComplete="name" placeholder={t("Who receives the item")} startIcon={<UserIcon className="size-4.5" />} {...form.getFieldProps('fullName')} />
            <Input label={t("Phone number")} type="tel" autoComplete="tel" inputMode="tel" placeholder="e.g. 0912 345 678" {...form.getFieldProps('phone')} />
          </div>
          <Select
            label={t('Delivery area')}
            name="deliveryZone"
            placeholder={t('Choose your area')}
            options={zoneOptions}
            value={zoneId}
            onChange={(value) => {
              setSubmitError(null)
              setZoneId(value)
            }}
            hint={t('Used to estimate simulated delivery from each seller. Areas are approximate.')}
          />
          <Input
            label={t("Delivery address")}
            placeholder={t("e.g. Dormitory A, room 305")}
            hint={t("Building and room, or a clear meeting point such as a building entrance.")}
            {...form.getFieldProps('address')}
          />
        </Section>

        <Section title={t('Simulated delivery')} icon={PackageIcon}>
          <p className="-mt-2 text-sm text-ink-muted">
            {t('Estimates are simulated from approximate area centres. No real carrier is contacted or booked. Free up to and including {km} km.', { km: quoteData?.freeRadiusKm ?? 3 })}
          </p>
          {!zoneId ? (
            <p className="rounded-control bg-subtle px-4 py-3 text-sm text-ink-muted">{t('Choose your delivery area to see delivery options.')}</p>
          ) : quote.error ? (
            <Alert variant="danger" title={t('Couldn’t estimate delivery')}>
              <span className="flex flex-wrap items-center gap-2">
                {t(describeQuoteError(quote.error))}
                <Button type="button" size="sm" variant="secondary" onClick={requote}>
                  {t('Try again')}
                </Button>
              </span>
            </Alert>
          ) : !quoteData ? (
            <LoadingState message={t('Estimating delivery…')} />
          ) : (
            <div className="flex flex-col gap-4">
              {sellerGroups.map(({ sellerId, seller, products: groupProducts }) => {
                const group = quoteData.groups.find((g) => g.sellerId === sellerId)
                return (
                  <fieldset key={sellerId} className="flex flex-col gap-2 rounded-control border border-line p-4">
                    <legend className="px-1 text-sm font-semibold text-ink">{t('Order from {name}', { name: seller?.name ?? group?.sellerName })}</legend>
                    <p className="text-xs text-ink-muted">
                      {t(groupProducts.length === 1 ? '{count} listing' : '{count} listings', { count: groupProducts.length })}
                      {group?.pickupZone && ` · ${t('from {area}', { area: `${group.pickupZone.name}, ${group.pickupZone.province}` })}`}
                      {group?.distanceKm != null && ` · ${t('about {km} km', { km: group.distanceKm })}`}
                    </p>
                    {!group || !group.available ? (
                      <Alert variant="warning" title={t('Delivery not available')}>
                        {t(UNAVAILABLE_REASONS[group?.reason] ?? 'This seller can’t deliver to this area. Choose another area or remove these items.')}
                      </Alert>
                    ) : (
                      group.options.map((option) => (
                        <label
                          key={option.carrier}
                          className={`flex items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                            !option.available
                              ? 'cursor-not-allowed border-line text-ink-muted opacity-60'
                              : carriers[sellerId] === option.carrier
                                ? 'cursor-pointer border-primary bg-primary-soft text-primary'
                                : 'cursor-pointer border-line text-ink hover:border-ink-muted/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`carrier-${sellerId}`}
                            value={option.carrier}
                            disabled={!option.available}
                            checked={carriers[sellerId] === option.carrier}
                            onChange={() => setPicked((current) => ({ ...current, [sellerId]: option.carrier }))}
                            className="accent-primary"
                          />
                          <span className="flex-1 font-medium">{t(option.label)}</span>
                          <span className="font-semibold whitespace-nowrap">
                            {!option.available ? t('Not available') : option.fee === 0 ? t('Free') : formatPrice(option.fee)}
                          </span>
                        </label>
                      ))
                    )}
                    {group?.free && <p className="text-xs font-medium text-success">{t('Free simulated delivery: within {km} km.', { km: quoteData.freeRadiusKm })}</p>}
                  </fieldset>
                )
              })}
              <p className={`flex items-center gap-1.5 text-xs ${quoteExpired ? 'font-medium text-danger' : 'text-ink-muted'}`} aria-live="polite">
                <ClockIcon className="size-3.5" />
                {quoteExpired
                  ? t('These estimates have expired.')
                  : t('Estimates valid until {time} ({minutes} min left).', { time: formatDateTime(quoteData.expiresAt), minutes: Math.ceil(secondsLeft / 60) })}
                {quoteExpired && (
                  <button type="button" onClick={requote} className="font-semibold text-primary hover:underline">
                    {t('Get new estimates')}
                  </button>
                )}
              </p>
            </div>
          )}
        </Section>

        <Section title={t("Payment")} icon={ShieldCheckIcon}>
          <p className="-mt-2 text-sm text-ink-muted">
            {t('Nothing is charged now. You pay each order online after its seller confirms it. Payments in this version are simulated: no money is charged.')}
          </p>
          <ol className="flex flex-col gap-2 rounded-control bg-subtle p-4 text-sm">
            {NEXT_STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">{index + 1}</span>
                <span className="text-ink-muted">{t(step)}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
        <section aria-labelledby="checkout-summary" className="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 id="checkout-summary" className="text-xl font-bold text-ink">
            {t("Your order")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t(items.length === 1 ? '{count} listing' : '{count} listings', { count: items.length })} ·{' '}
            {sellerGroups.length === 1 ? t('one order') : t('{count} orders (one per seller)', { count: sellerGroups.length })}
          </p>
          <ul className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
            {sellerGroups.map(({ sellerId, seller, products: groupProducts }) => {
              const line = totals.groups.find((g) => g.sellerId === sellerId)
              return (
                <li key={sellerId} aria-label={t('Order from {name}', { name: seller?.name })} className="flex flex-col gap-3">
                  <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('Order from {name}', { name: seller?.name })}</p>
                  {groupProducts.map((product) => (
                    <div key={product.id} className="flex gap-3">
                      <span className="block size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
                        <ImageSlot src={product.images[0]} alt="" />
                      </span>
                      <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-ink">{product.title}</p>
                      <p className="text-sm font-semibold whitespace-nowrap text-ink">{formatPrice(product.price)}</p>
                    </div>
                  ))}
                  <dl className="flex flex-col gap-1 text-xs text-ink-muted">
                    <div className="flex justify-between">
                      <dt>{t("Order subtotal")}</dt>
                      <dd className="font-semibold text-ink">{formatPrice(line?.subtotal ?? 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>{line?.option ? t(line.option.label) : t('Simulated delivery')}</dt>
                      <dd className="font-semibold text-ink">{line?.fee == null ? '—' : line.fee === 0 ? t('Free') : formatPrice(line.fee)}</dd>
                    </div>
                  </dl>
                </li>
              )
            })}
          </ul>
          <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t("Subtotal")}</dt>
              <dd className="text-ink">{formatPrice(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t('Simulated delivery')}</dt>
              <dd className="text-ink">{totals.complete ? (totals.shipping === 0 ? t('Free') : formatPrice(totals.shipping)) : '—'}</dd>
            </div>
            <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
              <dt className="font-semibold text-ink">{t("Total")}</dt>
              <dd className="text-2xl font-bold tracking-tight text-ink">{totals.complete ? formatPrice(totals.total) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-muted">{t('The server checks prices and delivery again when you place the order.')}</p>
          <Button type="submit" size="lg" fullWidth className="mt-5" loading={form.isSubmitting} disabled={form.isSubmitting || !canSubmit}>
            {t("Place order request")}
            <ArrowRightIcon className="size-4.5" />
          </Button>
          {!zoneId && <p className="mt-2 text-xs text-ink-muted">{t('Choose your delivery area first.')}</p>}
          {submitError && (
            <Alert variant={submitError.uncertain ? 'warning' : 'danger'} title={t(submitError.title)} className="mt-4">
              {t(submitError.text)}{' '}
              {submitError.orderIds?.length > 0 && (
                <Link to={PATHS.orderConfirmation(submitError.orderIds)} className="font-semibold text-primary hover:underline">
                  {t('Open your orders')}
                </Link>
              )}
              {submitError.uncertain && (
                <Link to={`${PATHS.orders}?status=ACTIVE`} className="font-semibold text-primary hover:underline">
                  {t('Check My orders')}
                </Link>
              )}
            </Alert>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
            <LockIcon className="mt-px size-3.5 shrink-0" />
            <span>
              {t('Nothing is charged now. By placing this order you agree to the')}{' '}
              <Link to={PATHS.terms} className="text-primary hover:underline">
                {t("Terms of service")}
              </Link>
              .
            </span>
          </p>
        </section>
        <Link to={PATHS.cart} className="py-1 text-center text-sm font-medium text-primary hover:underline">
          {t("← Back to cart")}
        </Link>
      </aside>
    </form>
  )
}

function describeQuoteError(error) {
  if (error?.code === 'INVALID_ZONE') return 'This delivery area is not available. Choose another area.'
  if (error?.code === 'OWN_LISTING') return 'One of these listings is your own.'
  if (error?.code === 'LISTING_UNAVAILABLE') return 'One of these listings is no longer available. Go back to your cart.'
  return describeApiError(error).message
}

/** Checkout failures → what the buyer should know and do. Never claims "not created" when it can't be sure. */
function describeCheckoutError(error) {
  const orderIds = existingOrderIds(error)
  if (orderIds.length) {
    return { title: 'You already ordered these items', text: 'Your earlier order request went through.', orderIds }
  }
  switch (error?.code) {
    case 'SHIPPING_QUOTE_CHANGED':
      return { title: 'Delivery estimate changed', text: 'The estimate expired or changed. New estimates are loading: check them and place the order again.' }
    case 'SHIPPING_QUOTE_INVALID':
      return { title: 'Delivery estimate not valid', text: 'New estimates are loading: check them and place the order again.' }
    case 'SHIPPING_UNAVAILABLE':
      return { title: 'Delivery not available', text: 'A seller can’t deliver to this area. Choose another area or remove those items.' }
    case 'INVALID_ZONE':
      return { title: 'Delivery area not available', text: 'Choose another delivery area.' }
    case 'LISTING_UNAVAILABLE':
      return { title: 'An item is no longer available', text: 'Another student may have ordered it. The list was refreshed; review it and try again.' }
    case 'PRICE_CHANGED':
      return { title: 'A price changed', text: 'The list was refreshed with the current prices. Review it and try again.' }
    case 'OWN_LISTING':
      return { title: 'This is your own listing', text: 'You can’t buy your own listing.' }
    case 'VALIDATION_FAILED':
      return { title: 'Check your details', text: error.fieldErrors?.map((f) => f.message).join(' ') || error.message }
    default:
      if (error?.isNetworkError || error?.kind === 'timeout' || error?.status >= 500) {
        // The request may have reached the server: never say "not placed" here, and don't resubmit blindly.
        return {
          title: 'We couldn’t confirm your order',
          text: 'The connection failed, so the order may or may not have been placed. Check My orders before trying again.',
          uncertain: true,
        }
      }
      return { title: 'Order not placed', text: describeApiError(error).message }
  }
}
