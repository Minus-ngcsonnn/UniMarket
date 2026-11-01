import { Link } from 'react-router'
import { SparklesIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ProductGrid from '../../components/product/ProductGrid'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { DEAL_MIN_SAVINGS } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import useTranslation from '../../i18n/useTranslation'

/** Student deals: available listings priced at least DEAL_MIN_SAVINGS % below their original price, biggest savings first. */
export default function DealsPage() {
  const { t } = useTranslation()
  const { data, error, isLoading, reload } = useAsyncData(() => productService.listProducts({ deals: true, pageSize: 24 }), 'deals')

  let content
  if (error) content = <ErrorState title={t("Couldn’t load deals")} message={error.message} onRetry={reload} />
  else if (isLoading) content = <ProductGrid isLoading layout="wide" skeletonCount={4} />
  else if (data.items.length === 0)
    content = (
      <EmptyState
        title={t("No deals right now")}
        description={t("Check back soon, or explore everything on the marketplace.")}
        action={
          <Link to={PATHS.marketplace} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t("Explore marketplace")}
          </Link>
        }
      />
    )
  else content = <ProductGrid products={data.items} layout="wide" label={t("Student deals")} />

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t("Student deals · UniMarket")}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'Student deals' }]} />
      <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
            <SparklesIcon className="size-4" />
            {t("Student deals")}
          </p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("The biggest savings on campus")}</h1>
          <p className="mt-1.5 text-ink-muted">Listings at least {DEAL_MIN_SAVINGS}% below their original price, biggest savings first.</p>
        </div>
      </header>
      <SampleDataNotice className="mb-5" />
      {content}
    </PageContainer>
  )
}
