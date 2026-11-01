import { Link, useParams } from 'react-router'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ProductForm from '../../components/listing/ProductForm'
import { ProductStatusBadge } from '../../components/product/ProductBadges'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Alert from '../../components/ui/Alert'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import LoadingState from '../../components/ui/LoadingState'
import { listingCode, listingToFormValues } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useListingSubmit from '../../hooks/useListingSubmit'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'

const MESSAGES = {
  saved: { title: 'Changes saved', text: 'Your listing has been updated.' },
  preview: {
    title: 'Preview only: changes not saved',
    text: 'Your changes passed all checks, but saving needs the UniMarket backend, which isn’t connected yet. The listing was not changed.',
  },
}

/** Edit Listing: the Create Listing form, filled with one of the student's own listings. */
export default function EditListingPage() {
  const { id } = useParams()
  const { data: listing, error, isLoading, reload } = useAsyncData(() => productService.getMyListing(id), `my-listing-${id}`)
  const { result, submit } = useListingSubmit((payload) => productService.updateListing(id, payload), MESSAGES)

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load this listing" message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message="Loading your listing…" />
  } else if (!listing) {
    content = (
      <EmptyState
        title="Listing not found"
        description="It may have been deleted, or it belongs to another student. You can only edit your own listings."
        action={
          <Link to={PATHS.myListings} className={buttonClasses({ variant: 'secondary' })}>
            Back to my listings
          </Link>
        }
      />
    )
  } else if (listing.status === 'SOLD') {
    content = (
      <EmptyState
        title="Sold listings can’t be edited"
        description="This item has already been sold, so its details are kept as they were."
        action={
          <Link to={PATHS.product(listing.id)} className={buttonClasses({ variant: 'secondary' })}>
            View listing
          </Link>
        }
      />
    )
  } else {
    content = (
      <ProductForm
        key={listing.id}
        initialValues={listingToFormValues(listing)}
        onSubmit={submit}
        submitLabel="Save changes"
        cancelTo={PATHS.myListings}
        notice={result && <Alert variant={result.variant} title={result.title}>{result.text}</Alert>}
      />
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>Edit listing · UniMarket</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My listings', to: PATHS.myListings }, { label: 'Edit listing' }]} />

      <header className="mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">Edit listing</h1>
        {listing && (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            {listingCode(listing.id)}
            <ProductStatusBadge status={listing.status} />
          </span>
        )}
      </header>

      <SampleDataNotice className="mb-4">You’re editing a sample listing. Sign-in and saving aren’t connected yet.</SampleDataNotice>
      {listing && listing.status !== 'SOLD' && (
        <Alert variant="info" title="Saving isn’t connected yet" className="mb-6">
          You can edit and check the form, but changes can’t be saved until the UniMarket backend is ready.
        </Alert>
      )}

      {content}
    </PageContainer>
  )
}
