import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import CheckoutSteps from '../../components/checkout/CheckoutSteps'
import { ArrowRightIcon, LockIcon, MapPinIcon, ShieldCheckIcon, UserIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ImageSlot from '../../components/ui/ImageSlot'
import Input from '../../components/ui/Input'
import LoadingState from '../../components/ui/LoadingState'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { isPurchasable } from '../../constants/moderation'
import { PAYMENT_METHODS, SELLER_CONFIRM_HOURS } from '../../constants/order'
import { CAMPUSES, CAMPUS_KEYS, UNIVERSITY_NAME } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useCart from '../../hooks/useCart'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { isSampleOrders, orderService } from '../../services/orders/orderService'
import BackendCheckout from './BackendCheckout'
import { productService } from '../../services/products/productService'
import { NOTE_MAX_LENGTH, validateDelivery } from '../../utils/checkoutValidation'
import { formatPrice } from '../../utils/format'
import useTranslation from '../../i18n/useTranslation'

const CAMPUS_OPTIONS = CAMPUS_KEYS.map((key) => ({ value: key, label: `${UNIVERSITY_NAME} · ${CAMPUSES[key].label}` }))
const NEXT_STEPS = [
  `Each seller confirms your order within ${SELLER_CONFIRM_HOURS} hours.`,
  'You pay online on UniMarket. Nothing is charged before that.',
  'The seller delivers the order to the address below.',
  'You confirm you’ve received it, and the order is complete.',
]

/** [{ seller, products }] in the order the sellers first appear. */
function groupBySeller(products) {
  const groups = new Map()
  products.forEach((product) => {
    if (!groups.has(product.sellerId)) groups.set(product.sellerId, { seller: product.seller, products: [] })
    groups.get(product.sellerId).products.push(product)
  })
  return [...groups.values()]
}

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

/**
 * Checkout (step 2 of 3). Follows the Business Plan: the buyer sends an order request with a delivery
 * address; payment happens online after the seller confirms. One order is created per listing.
 * Items come from ?items=<ids> (selected cart lines, or one listing for "Buy now").
 */
export default function CheckoutPage() {
  const [searchParams] = useSearchParams()
  if (!isSampleOrders) {
    const ids = [...new Set((searchParams.get('items') ?? '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 50)
    return (
      <CheckoutShell>
        <BackendCheckout ids={ids} />
      </CheckoutShell>
    )
  }
  return <SampleCheckout />
}

/** Page frame shared by both checkouts. */
function CheckoutShell({ children, sample = false }) {
  const { t } = useTranslation()
  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t("Checkout · UniMarket")}</title>
      <Breadcrumbs items={[{ label: 'Marketplace', to: PATHS.marketplace }, { label: 'Shopping cart', to: PATHS.cart }, { label: 'Checkout' }]} />
      <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("Checkout")}</h1>
          <p className="mt-1.5 text-ink-muted">
            {sample ? t("Tell the seller where to deliver. You’ll pay online once they confirm.") : t('Choose where to deliver and a simulated carrier per seller. You’ll pay online once each seller confirms.')}
          </p>
        </div>
        <CheckoutSteps current="Checkout" />
      </header>
      {sample && <SampleDataNotice className="mb-5">{t("Sample orders placed here are saved in this browser only. No payment is taken.")}</SampleDataNotice>}
      {children}
    </PageContainer>
  )
}

/** Checkout with sample data (no backend): unchanged Stage 4 preview. */
function SampleCheckout() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const cart = useCart()
  const ids = (searchParams.get('items') ?? '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0)
  const { data: products, error, isLoading, reload } = useAsyncData(
    () => (ids.length ? productService.getProductsByIds(ids) : Promise.resolve([])),
    `checkout-${ids.join(',')}`,
  )
  const [submitError, setSubmitError] = useState(null)
  const currentUserId = productService.getCurrentUserId()

  const items = (products ?? []).filter((p) => isPurchasable(p) && p.sellerId !== currentUserId)
  const unavailable = (products ?? []).filter((p) => !items.includes(p))
  const total = items.reduce((sum, p) => sum + p.price, 0)
  const sellerGroups = groupBySeller(items) // Q3: one order per seller, so the summary is grouped the same way

  const form = useForm({
    initialValues: { fullName: '', phone: '', campus: 'HANOI', address: '', note: '' },
    validate: validateDelivery,
    onSubmit: async (values) => {
      setSubmitError(null)
      try {
        const delivery = { ...values, fullName: values.fullName.trim(), address: values.address.trim(), note: values.note.trim() }
        const { orders } = await orderService.placeOrders(
          items.map((p) => p.id),
          delivery,
        )
        cart.remove(items.map((p) => p.id))
        navigate(PATHS.orderConfirmation(orders.map((o) => o.id)), { replace: true })
      } catch (placeError) {
        setSubmitError(placeError.message)
      }
    },
  })

  let content
  if (error) {
    content = <ErrorState title={t("Couldn’t load checkout")} message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message={t("Preparing checkout…")} />
  } else if (items.length === 0) {
    content = (
      <EmptyState
        title={t("Nothing to check out")}
        description={unavailable.length ? 'The selected listings are no longer available.' : 'Choose items in your cart, or use “Buy now” on a listing.'}
        action={
          <Link to={PATHS.cart} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t("Back to cart")}
          </Link>
        }
      />
    )
  } else {
    content = (
      <form noValidate onSubmit={form.handleSubmit} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex flex-col gap-5">
          {unavailable.length > 0 && (
            <Alert variant="warning" title={t("Some items were removed from this order")}>
              {t(unavailable.length === 1 ? '{titles} is no longer available.' : '{titles} are no longer available.', { titles: unavailable.map((p) => p.title).join(', ') })}
            </Alert>
          )}

          <Section title={t("Delivery details")} icon={MapPinIcon}>
            <p className="-mt-2 text-sm text-ink-muted">{t("The seller uses these details to arrange delivery to you on campus.")}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label={t("Full name")} autoComplete="name" placeholder={t("Who receives the item")} startIcon={<UserIcon className="size-4.5" />} {...form.getFieldProps('fullName')} />
              <Input label={t("Phone number")} type="tel" autoComplete="tel" inputMode="tel" placeholder="e.g. 0912 345 678" {...form.getFieldProps('phone')} />
            </div>
            <Select
              label={t("Campus")}
              name="campus"
              options={CAMPUS_OPTIONS}
              value={form.values.campus}
              onChange={(campus) => form.setFieldValue('campus', campus)}
              error={form.touched.campus ? form.errors.campus : undefined}
            />
            <Input
              label={t("Delivery address on campus")}
              placeholder={t("e.g. Dormitory A, room 305")}
              hint={t("Building and room, or a clear meeting point such as a building entrance.")}
              {...form.getFieldProps('address')}
            />
            <Textarea label={t("Note to seller (optional)")} rows={3} maxLength={NOTE_MAX_LENGTH} placeholder={t("e.g. Best time to deliver")} {...form.getFieldProps('note')} />
          </Section>

          <Section title={t("Payment")} icon={ShieldCheckIcon}>
            <p className="-mt-2 text-sm text-ink-muted">
              {t('UniMarket only accepts online payment through the website. You’ll pay each order after the seller confirms it. Never transfer money to a seller directly.')}
            </p>
            <ul className="flex flex-wrap gap-2" aria-label={t("Accepted payment methods")}>
              {PAYMENT_METHODS.map((method) => (
                <li key={method.value} className="rounded-control border border-line px-3 py-1.5 text-xs font-medium text-ink">
                  {method.label}
                </li>
              ))}
            </ul>
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
              {t(items.length === 1 ? '{count} listing' : '{count} listings', { count: items.length })} · {sellerGroups.length === 1 ? t('one order') : t('{count} orders (one per seller)', { count: sellerGroups.length })}
            </p>
            <ul className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
              {sellerGroups.map(({ seller, products: groupProducts }) => (
                <li key={seller?.id} aria-label={t('Order from {name}', { name: seller?.name })} className="flex flex-col gap-3">
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
                  {sellerGroups.length > 1 && (
                    <p className="flex justify-between text-xs text-ink-muted">
                      <span>{t("Order subtotal")}</span>
                      <span className="font-semibold text-ink">{formatPrice(groupProducts.reduce((sum, p) => sum + p.price, 0))}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t("Subtotal")}</dt>
                <dd className="text-ink">{formatPrice(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t("Delivery")}</dt>
                <dd className="text-ink">{t("Arranged by seller")}</dd>
              </div>
              <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
                <dt className="font-semibold text-ink">{t("Total")}</dt>
                <dd className="text-2xl font-bold tracking-tight text-ink">{formatPrice(total)}</dd>
              </div>
            </dl>
            <Button type="submit" size="lg" fullWidth className="mt-5" loading={form.isSubmitting}>
              {t("Place order request")}
              <ArrowRightIcon className="size-4.5" />
            </Button>
            {submitError && (
              <Alert variant="danger" title={t("Order not placed")} className="mt-4">
                {submitError}
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

  return <CheckoutShell sample>{content}</CheckoutShell>
}
