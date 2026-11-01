import { Link } from 'react-router'
import { HeartIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ProductGrid from '../../components/product/ProductGrid'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { isPubliclyListed } from '../../constants/moderation'
import useAsyncData from '../../hooks/useAsyncData'
import useSaved from '../../hooks/useSaved'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import useTranslation from '../../i18n/useTranslation'

/**
 * Saved items (wishlist): listings the student hearted, newest first. Kept in this browser until
 * accounts exist. Listings that were removed or hidden by moderation are listed separately so the
 * student can clear them.
 */
export default function SavedItemsPage() {
  const { t } = useTranslation()
  const saved = useSaved()
  const { data, previousData, error, isLoading, reload } = useAsyncData(
    () => (saved.ids.length ? productService.getProductsByIds(saved.ids) : Promise.resolve([])),
    `saved-${saved.ids.join(',')}`,
  )
  const products = data ?? previousData ?? []
  const byId = new Map(products.map((p) => [p.id, p]))
  const visible = saved.ids.map((id) => byId.get(id)).filter((p) => p && isPubliclyListed(p))
  const goneIds = isLoading ? [] : saved.ids.filter((id) => !byId.has(id) || !isPubliclyListed(byId.get(id)))
  const sold = visible.filter((p) => p.status !== 'AVAILABLE')

  let content
  if (error) {
    content = <ErrorState title={t("Couldn’t load your saved items")} message={error.message} onRetry={reload} />
  } else if (saved.count === 0) {
    content = (
      <EmptyState
        icon={<HeartIcon className="size-6" />}
        title={t("Nothing saved yet")}
        description={t("Tap the heart on any listing to keep it here while you decide.")}
        action={
          <Link to={PATHS.marketplace} className={buttonClasses({ size: 'sm' })}>
            {t("Explore marketplace")}
          </Link>
        }
      />
    )
  } else if (isLoading && !previousData) {
    content = <ProductGrid isLoading layout="wide" skeletonCount={Math.min(4, saved.count)} />
  } else {
    content = (
      <div className="flex flex-col gap-6">
        {sold.length > 0 && (
          <div className="flex flex-col gap-3 rounded-control bg-subtle px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink">
              {t(sold.length === 1 ? '{count} saved listing is reserved or sold.' : '{count} saved listings are reserved or sold.', { count: sold.length })}
            </p>
            <Button size="sm" variant="secondary" onClick={() => saved.remove(sold.map((p) => p.id))}>
              {t("Remove reserved and sold")}
            </Button>
          </div>
        )}
        {visible.length > 0 && <ProductGrid products={visible} layout="wide" label={t("Saved items")} />}
        {goneIds.length > 0 && (
          <div className="flex flex-col gap-3 rounded-control border border-dashed border-line px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-muted">
              {t(goneIds.length === 1 ? '{count} saved listing is no longer on the marketplace.' : '{count} saved listings are no longer on the marketplace.', { count: goneIds.length })}
            </p>
            <Button size="sm" variant="ghost" onClick={() => saved.remove(goneIds)}>
              {t(goneIds.length === 1 ? 'Clear it' : 'Clear them')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t("Saved items · UniMarket")}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'Saved items' }]} />
      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("Saved items")}</h1>
        <p className="mt-1.5 text-ink-muted">{t("Listings you’ve hearted. Saving doesn’t reserve an item, so check out when you’re ready.")}</p>
      </header>
      <SampleDataNotice className="mb-6">{t("Saved items are kept in this browser only until accounts are connected.")}</SampleDataNotice>
      {content}
    </PageContainer>
  )
}
