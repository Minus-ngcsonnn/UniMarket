import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CONDITIONS } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import { isShownAsFeatured } from '../../utils/featured'
import { formatPrice, savingsPercent } from '../../utils/format'
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, StarIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import ImageSlot from '../ui/ImageSlot'

// Listings with a running paid promotion (backend `featured`: Paid and now within [StartsAt, EndsAt)), only approved,
// available ones. Same source as the "Featured Products" section; nothing is hard-coded.
const BANNER_QUERY = { featured: true }
const MAX_BANNERS = 10
const AUTOPLAY_MS = 6000

/** Amber "Featured" pill of the promotion banners (reference design). */
function BannerBadge({ small = false }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full bg-warning font-semibold text-white shadow-sm ${
        small ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      <StarIcon className={small ? 'size-3.5 fill-current' : 'size-4 fill-current'} />
      {t('Featured')}
    </span>
  )
}

/** Short facts under the title: condition · pickup area (real listing data, no invented copy). */
function useFacts(product) {
  const { t } = useTranslation()
  return [CONDITIONS[product.condition] && t(`conditions.${product.condition}`), product.locationLabel && t(product.locationLabel)]
    .filter(Boolean)
    .join(' • ')
}

function Price({ product, large = false }) {
  const { t } = useTranslation()
  const savings = savingsPercent(product.price, product.originalPrice)
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`font-extrabold tracking-tight text-primary ${large ? 'text-2xl lg:text-3xl' : 'text-lg sm:text-xl'}`}>{formatPrice(product.price)}</span>
      {large && savings > 0 && (
        <>
          <s className="text-sm text-ink-muted sm:text-base">
            <span className="sr-only">{t('product.originalPrice')}: </span>
            {formatPrice(product.originalPrice)}
          </s>
          <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-semibold text-white">-{savings}%</span>
        </>
      )}
    </p>
  )
}

/** One large slide: text on the left, product photo on the right; the whole slide opens the product page. */
function MainSlide({ product, hidden }) {
  const { t } = useTranslation()
  const facts = useFacts(product)
  return (
    <Link
      to={PATHS.product(product.id)}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="group grid h-full w-full shrink-0 grid-cols-1 items-center gap-4 px-6 pt-6 pb-10 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-6 sm:px-12 sm:py-6 lg:px-16 lg:py-8"
    >
      <div className="flex min-w-0 flex-col gap-2.5 lg:gap-4">
        <BannerBadge />
        <h2 className="line-clamp-2 text-2xl leading-tight font-extrabold tracking-tight text-ink lg:text-[2.1rem]">{product.title}</h2>
        {facts && <p className="truncate text-sm text-ink-muted sm:text-base">{facts}</p>}
        <Price product={product} large />
        <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-colors group-hover:bg-primary-hover sm:text-base">
          {t('View now')}
          <ArrowRightIcon className="size-4" />
        </span>
      </div>
      <div className="relative order-first h-36 overflow-hidden rounded-2xl bg-surface/70 shadow-[0_18px_40px_-24px_rgb(36_89_224/0.55)] ring-1 ring-white sm:order-none sm:h-44 lg:h-56">
        <ImageSlot src={product.images?.[0]} alt="" className="transition-transform duration-500 group-hover:scale-[1.03]" demoLabel />
      </div>
    </Link>
  )
}

/**
 * Large carousel. Several slides: previous / next buttons, dots, autoplay (paused on hover / focus and when the user
 * prefers reduced motion). One slide: no controls.
 */
function MainCarousel({ products, label, className = '' }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = products.length
  const current = count ? index % count : 0
  const go = (next) => setIndex((next + count) % count)

  useEffect(() => {
    if (count < 2 || paused) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [count, paused])

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={`relative isolate overflow-hidden rounded-2xl bg-linear-to-br from-primary-soft via-primary-soft to-primary/20 ring-1 ring-primary/10 ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -top-20 right-1/4 -z-10 size-72 rounded-full bg-white/50 blur-3xl" />
      <div className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${current * 100}%)` }}>
        {products.map((product, i) => (
          <MainSlide key={product.id} product={product} hidden={i !== current} />
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(current - 1)}
            aria-label={t('Previous promotion')}
            className="absolute top-24 left-2 flex size-9 -translate-y-1/2 sm:top-1/2 items-center justify-center rounded-full bg-surface/95 text-ink shadow-pop transition-colors hover:text-primary sm:left-3 sm:size-10"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(current + 1)}
            aria-label={t('Next promotion')}
            className="absolute top-24 right-2 flex size-9 -translate-y-1/2 sm:top-1/2 items-center justify-center rounded-full bg-surface/95 text-ink shadow-pop transition-colors hover:text-primary sm:right-3 sm:size-10"
          >
            <ChevronRightIcon className="size-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {products.map((product, i) => (
              <button
                key={product.id}
                type="button"
                onClick={() => go(i)}
                aria-label={t('Show promotion {number} of {count}', { number: i + 1, count })}
                aria-current={i === current ? 'true' : undefined}
                className={`h-2 rounded-full transition-all ${i === current ? 'w-6 bg-primary' : 'w-2 bg-primary/25 hover:bg-primary/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Smaller banner on the right (desktop / tablet). */
function SideBanner({ product }) {
  const facts = useFacts(product)
  return (
    <Link
      to={PATHS.product(product.id)}
      className="group relative isolate grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 overflow-hidden rounded-2xl bg-linear-to-br from-primary/5 via-primary-soft to-primary/15 p-4 ring-1 ring-primary/10 transition-shadow hover:shadow-pop lg:grid-cols-[minmax(0,1fr)_9rem] lg:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <BannerBadge small />
        <h3 className="line-clamp-2 text-base leading-snug font-bold text-ink lg:text-lg">{product.title}</h3>
        {facts && <p className="truncate text-xs text-ink-muted">{facts}</p>}
        <Price product={product} />
      </div>
      <div className="h-24 overflow-hidden rounded-xl bg-surface/70 ring-1 ring-white lg:h-28">
        <ImageSlot src={product.images?.[0]} alt="" className="transition-transform duration-500 group-hover:scale-[1.04]" />
      </div>
    </Link>
  )
}

/**
 * Top promotional banner of the homepage (reference design): one large carousel (~65 %) and two stacked side banners
 * (~35 %) on desktop / tablet, one carousel with every promoted listing on mobile. Shows only listings whose paid
 * promotion is running now; the visible main and side banners never repeat a listing. Renders nothing while loading,
 * on error or when no promotion runs, so the page below is unchanged.
 */
export default function HomePromotionBanner() {
  const { t } = useTranslation()
  const { data } = useAsyncData(() => productService.listProducts({ ...BANNER_QUERY, pageSize: MAX_BANNERS }), 'home-promotion-banner')
  const promoted = (data?.items ?? []).filter(isShownAsFeatured)
  if (promoted.length === 0) return null

  // 1–2 listings: main + (one) side. 3 or more: the first two are the side banners, the rest rotate in the main banner.
  const sides = promoted.length >= 3 ? promoted.slice(0, 2) : promoted.slice(1)
  const main = promoted.length >= 3 ? promoted.slice(2) : promoted.slice(0, 1)
  const label = t('Promoted listings')

  return (
    <section aria-label={label} className="pt-4 sm:pt-6">
      <PageContainer>
        {/* Mobile: a single carousel with every promoted listing. */}
        <MainCarousel products={promoted} label={label} className="md:hidden" />

        {/* Tablet / desktop: large carousel + stacked side banners. */}
        <div className={`hidden gap-3 md:grid lg:gap-4 ${sides.length ? 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]' : ''}`}>
          <MainCarousel products={main} label={label} className="md:h-[19rem] lg:h-[20rem]" />
          {sides.length > 0 && (
            <div className="flex flex-col gap-3 md:h-[19rem] lg:h-[20rem] lg:gap-4">
              {sides.map((product) => (
                <SideBanner key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </section>
  )
}
