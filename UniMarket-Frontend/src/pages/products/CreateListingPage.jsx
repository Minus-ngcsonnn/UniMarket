import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ProductForm from '../../components/listing/ProductForm'
import Alert from '../../components/ui/Alert'
import { EMPTY_LISTING } from '../../constants/product'
import useListingSubmit from '../../hooks/useListingSubmit'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'
import useTranslation from '../../i18n/useTranslation'

const MESSAGES = {
  saved: { title: 'Listing sent for review', text: 'An admin will check it shortly. It appears in the marketplace once it’s approved.' },
  preview: {
    title: 'Preview only: listing not published',
    text: 'Your listing passed all checks, but publishing needs the UniMarket backend, which isn’t connected yet. Nothing was saved and no photos were uploaded.',
  },
}

/** Create Listing ("Sell an item"), approved layout: form + live preview. */
export default function CreateListingPage() {
  const { t } = useTranslation()
  const { result, submit } = useListingSubmit(productService.createListing, MESSAGES)

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t("Sell an item · UniMarket")}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My listings', to: PATHS.myListings }, { label: 'Sell an item' }]} />

      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("Sell an item")}</h1>
        <p className="mt-1.5 text-ink-muted">{t("Give your things a second campus life. Listing is always free, and an admin checks each new listing before it goes live.")}</p>
      </header>

      <Alert variant="info" title={t("Publishing isn’t connected yet")} className="mb-6">
        {t("You can fill in and check the form, but listings can’t be saved until the UniMarket backend is ready.")}
      </Alert>

      <ProductForm
        initialValues={EMPTY_LISTING}
        onSubmit={submit}
        submitLabel={t("Publish listing")}
        cancelTo={PATHS.myListings}
        notice={result && <Alert variant={result.variant} title={result.title}>{result.text}</Alert>}
      />
    </PageContainer>
  )
}
