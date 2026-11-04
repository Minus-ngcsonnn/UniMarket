import useAsyncData from '../../hooks/useAsyncData'
import useTranslation from '../../i18n/useTranslation'
import { BackendPendingError } from '../../services/products/productApi'
import { productService } from '../../services/products/productService'
import { AlertCircleIcon, InboxIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import SectionHeader from '../layout/SectionHeader'
import ProductCardSkeleton from '../product/ProductCardSkeleton'
import ProductGrid from '../product/ProductGrid'
import Button from '../ui/Button'

const PLACEHOLDER_CARDS = 4

/** Outline cards in the Figma grid with a message on top (no listings yet / could not load). */
function PlaceholderGrid({ icon, title, description, action }) {
  return (
    <div className="relative">
      <ul className="grid grid-cols-2 gap-3 opacity-80 sm:gap-4 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
          // Mobile/tablet show 2 outlines, desktop shows the full row of 4.
          <li key={index} className={index >= 2 ? 'hidden lg:block' : ''}>
            <ProductCardSkeleton />
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-line bg-surface/95 px-6 py-6 text-center shadow-pop backdrop-blur-sm">
          {icon}
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-ink">{title}</p>
            <p className="text-sm text-ink-muted">{description}</p>
          </div>
          {action}
        </div>
      </div>
    </div>
  )
}

/**
 * Homepage product section ("Featured Products", "Recently Listed") showing up to 4 listings.
 * While the product API is not connected (production without sample data) it shows the empty state.
 *
 * @param {object} query parameters for productService.listProducts
 * @param {boolean} [hideWhenEmpty] render nothing when the section has no listings (e.g. no running promotions)
 * @param {number} [pageSize] listings to show (default one row of 4)
 */
export default function ListingSection({
  id, title, description, badge, icon, viewAll, query, emptyTitle, emptyDescription, emptyAction, hideWhenEmpty = false, pageSize = PLACEHOLDER_CARDS,
}) {
  const { t } = useTranslation()
  const { data, error, isLoading, reload } = useAsyncData(
    () => productService.listProducts({ pageSize, ...query }),
    `${id}-${pageSize}-${JSON.stringify(query)}`,
  )

  const iconClass = 'flex size-11 items-center justify-center rounded-full'
  let content
  if (isLoading) {
    content = <ProductGrid isLoading layout="wide" skeletonCount={PLACEHOLDER_CARDS} label={title} />
  } else if (error && !(error instanceof BackendPendingError)) {
    content = (
      <PlaceholderGrid
        icon={
          <span className={`${iconClass} bg-danger-soft text-danger`}>
            <AlertCircleIcon className="size-5" />
          </span>
        }
        title={t('sections.errorTitle')}
        description={t('sections.errorText')}
        action={
          <Button size="sm" variant="secondary" onClick={reload}>
            {t('sections.retry')}
          </Button>
        }
      />
    )
  } else if (data?.items.length) {
    content = <ProductGrid products={data.items} layout="wide" label={title} />
  } else if (hideWhenEmpty) {
    return null
  } else {
    content = (
      <PlaceholderGrid
        icon={
          <span className={`${iconClass} bg-primary-soft text-primary`}>
            <InboxIcon className="size-5" />
          </span>
        }
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <section aria-labelledby={id}>
      <PageContainer>
        <SectionHeader id={id} icon={icon} title={title} description={description} badge={badge} action={viewAll} />
        {content}
      </PageContainer>
    </section>
  )
}
