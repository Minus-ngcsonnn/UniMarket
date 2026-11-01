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
import { PAYMENT_METHODS, SELLER_CONFIRM_HOURS } from '../../constants/order'
import { CAMPUSES, CAMPUS_KEYS, UNIVERSITY_NAME } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useCart from '../../hooks/useCart'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { orderService } from '../../services/orders/orderService'
import { productService } from '../../services/products/productService'
import { NOTE_MAX_LENGTH, validateDelivery } from '../../utils/checkoutValidation'
import { formatPrice } from '../../utils/format'

const CAMPUS_OPTIONS = CAMPUS_KEYS.map((key) => ({ value: key, label: `${UNIVERSITY_NAME} · ${CAMPUSES[key].label}` }))
const NEXT_STEPS = [
  `Each seller confirms your order within ${SELLER_CONFIRM_HOURS} hours.`,
  'You pay online on UniMarket. Nothing is charged before that.',
  'The seller delivers the item to the address below.',
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

/**
 * Checkout (step 2 of 3). Follows the Business Plan: the buyer sends an order request with a delivery
 * address; payment happens online after the seller confirms. One order is created per listing.
 * Items come from ?items=<ids> (selected cart lines, or one listing for "Buy now").
 */
export default function CheckoutPage() {
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

  const items = (products ?? []).filter((p) => p.status === 'AVAILABLE' && p.sellerId !== currentUserId)
  const unavailable = (products ?? []).filter((p) => !items.includes(p))
  const total = items.reduce((sum, p) => sum + p.price, 0)

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
    content = <ErrorState title="Couldn’t load checkout" message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message="Preparing checkout…" />
  } else if (items.length === 0) {
    content = (
      <EmptyState
        title="Nothing to check out"
        description={unavailable.length ? 'The selected listings are no longer available.' : 'Choose items in your cart, or use “Buy now” on a listing.'}
        action={
          <Link to={PATHS.cart} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Back to cart
          </Link>
        }
      />
    )
  } else {
    content = (
      <form noValidate onSubmit={form.handleSubmit} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex flex-col gap-5">
          {unavailable.length > 0 && (
            <Alert variant="warning" title="Some items were removed from this order">
              {unavailable.map((p) => p.title).join(', ')} {unavailable.length === 1 ? 'is' : 'are'} no longer available.
            </Alert>
          )}

          <Section title="Delivery details" icon={MapPinIcon}>
            <p className="-mt-2 text-sm text-ink-muted">The seller uses these details to arrange delivery to you on campus.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Full name" autoComplete="name" placeholder="Who receives the item" startIcon={<UserIcon className="size-4.5" />} {...form.getFieldProps('fullName')} />
              <Input label="Phone number" type="tel" autoComplete="tel" inputMode="tel" placeholder="e.g. 0912 345 678" {...form.getFieldProps('phone')} />
            </div>
            <Select
              label="Campus"
              name="campus"
              options={CAMPUS_OPTIONS}
              value={form.values.campus}
              onChange={(campus) => form.setFieldValue('campus', campus)}
              error={form.touched.campus ? form.errors.campus : undefined}
            />
            <Input
              label="Delivery address on campus"
              placeholder="e.g. Dormitory A, room 305"
              hint="Building and room, or a clear meeting point such as a building entrance."
              {...form.getFieldProps('address')}
            />
            <Textarea label="Note to seller (optional)" rows={3} maxLength={NOTE_MAX_LENGTH} placeholder="e.g. Best time to deliver" {...form.getFieldProps('note')} />
          </Section>

          <Section title="Payment" icon={ShieldCheckIcon}>
            <p className="-mt-2 text-sm text-ink-muted">
              UniMarket only accepts <span className="font-medium text-ink">online payment through the website</span>. You’ll pay each order after the seller confirms it. Never transfer money to a seller directly.
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Accepted payment methods">
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
                  <span className="text-ink-muted">{step}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
          <section aria-labelledby="checkout-summary" className="rounded-card border border-line bg-surface p-5 sm:p-6">
            <h2 id="checkout-summary" className="text-xl font-bold text-ink">
              Your order
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {items.length} {items.length === 1 ? 'listing' : 'listings'} · {items.length === 1 ? 'one order' : `${items.length} separate orders (one per listing)`}
            </p>
            <ul className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              {items.map((product) => (
                <li key={product.id} className="flex gap-3">
                  <span className="block size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
                    <ImageSlot src={product.images[0]} alt="" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-ink">{product.title}</p>
                    <p className="text-xs text-ink-muted">Sold by {product.seller?.name}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap text-ink">{formatPrice(product.price)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="text-ink">{formatPrice(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd className="text-ink">Arranged by seller</dd>
              </div>
              <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-2xl font-bold tracking-tight text-ink">{formatPrice(total)}</dd>
              </div>
            </dl>
            <Button type="submit" size="lg" fullWidth className="mt-5" loading={form.isSubmitting}>
              Place order request
              <ArrowRightIcon className="size-4.5" />
            </Button>
            {submitError && (
              <Alert variant="danger" title="Order not placed" className="mt-4">
                {submitError}
              </Alert>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
              <LockIcon className="mt-px size-3.5 shrink-0" />
              <span>
                Nothing is charged now. By placing this order you agree to the{' '}
                <Link to={PATHS.terms} className="text-primary hover:underline">
                  Terms of service
                </Link>
                .
              </span>
            </p>
          </section>
          <Link to={PATHS.cart} className="text-center text-sm font-medium text-primary hover:underline">
            ← Back to cart
          </Link>
        </aside>
      </form>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>Checkout · UniMarket</title>
      <Breadcrumbs items={[{ label: 'Marketplace', to: PATHS.marketplace }, { label: 'Shopping cart', to: PATHS.cart }, { label: 'Checkout' }]} />
      <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">Checkout</h1>
          <p className="mt-1.5 text-ink-muted">Tell the seller where to deliver. You’ll pay online once they confirm.</p>
        </div>
        <CheckoutSteps current="Checkout" />
      </header>
      <SampleDataNotice className="mb-5">Orders placed here are kept in this browser tab only and disappear when you reload. No payment is taken.</SampleDataNotice>
      {content}
    </PageContainer>
  )
}
