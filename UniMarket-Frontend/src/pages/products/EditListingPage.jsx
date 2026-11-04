import { Link, useParams } from 'react-router'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ProductForm from '../../components/listing/ProductForm'
import { ModerationBadge, ProductStatusBadge } from '../../components/product/ProductBadges'
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
import { isSampleData, productService } from '../../services/products/productService'
import { describeApiError } from '../../utils/apiErrorMessage'
import useTranslation from '../../i18n/useTranslation'

const MESSAGES = {
  saved: { title: 'Changes sent for review', text: 'An admin will check your changes before the updated listing goes live again.' },
  preview: {
    title: 'Preview only: changes not saved',
    text: 'Your changes passed all checks, but saving needs the UniMarket backend, which isn’t connected yet. The listing was not changed.',
  },
}

/**
 * Approved rule (pre-moderation): every saved edit sends the listing back to "Pending review", so changed
 * photos, prices or descriptions are checked before buyers see them.
 */
const REVIEW_NOTES = {
  APPROVED: {
    title: 'Edits are checked again',
    text: 'After you save, this listing is hidden from the marketplace until an admin approves the changes (usually the same day). Open orders aren’t affected.',
  },
  PENDING: { title: 'Waiting for review', text: 'This listing hasn’t been approved yet. Your changes will be reviewed together with it.' },
  BLOCKED: { title: 'Fix it and send it again', text: 'An admin blocked this listing. Change what they asked for and save to send it for review again.' },
}

/** Edit Listing: the Create Listing form, filled with one of the student's own listings. */
export default function EditListingPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data: listing, error, isLoading, reload } = useAsyncData(() => productService.getMyListing(id), `my-listing-${id}`)
  const { result, submit, serverErrors, uploadProgress } = useListingSubmit(
    (payload, options) => productService.updateListing(id, payload, options),
    MESSAGES,
    { onSaved: reload },
  )

  let content
  if (error) {
    content = <ErrorState title={t("Couldn’t load this listing")} message={describeApiError(error).message} onRetry={reload} />
  } else if (isLoading) {
    content = <LoadingState message={t("Loading your listing…")} />
  } else if (!listing) {
    content = (
      <EmptyState
        title={t("Listing not found")}
        description={t("It may have been deleted, or it belongs to another student. You can only edit your own listings.")}
        action={
          <Link to={PATHS.myListings} className={buttonClasses({ variant: 'secondary' })}>
            {t("Back to my listings")}
          </Link>
        }
      />
    )
  } else if (listing.status === 'SOLD' || listing.editable === false) {
    content = (
      <EmptyState
        title={listing.status === 'SOLD' ? t("Sold listings can’t be edited") : t('This listing can’t be edited now')}
        description={
          listing.status === 'SOLD'
            ? t("This item has already been sold, so its details are kept as they were.")
            : t('It is reserved or part of an open order. You can edit it again if the order is cancelled.')
        }
        action={
          <Link to={PATHS.product(listing.id)} className={buttonClasses({ variant: 'secondary' })}>
            {t("View listing")}
          </Link>
        }
      />
    )
  } else {
    content = (
      <ProductForm
        key={`${listing.id}-${listing.updatedAt ?? ''}`}
        initialValues={listingToFormValues(listing)}
        onSubmit={submit}
        serverErrors={serverErrors}
        uploadProgress={uploadProgress}
        submitLabel={t("Save changes")}
        cancelTo={PATHS.myListings}
        notice={result && <Alert variant={result.variant} title={result.title}>{result.text}</Alert>}
      />
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t("Edit listing · UniMarket")}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My listings', to: PATHS.myListings }, { label: 'Edit listing' }]} />

      <header className="mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("Edit listing")}</h1>
        {listing && (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            {listingCode(listing.id)}
            <ProductStatusBadge status={listing.status} />
            <ModerationBadge moderation={listing.moderation} />
          </span>
        )}
      </header>

      <SampleDataNotice className="mb-4">{t("You’re editing a sample listing. Sign-in and saving aren’t connected yet.")}</SampleDataNotice>
      {listing && listing.status !== 'SOLD' && listing.editable !== false && (
        <div className="mb-6 flex flex-col gap-3">
          <Alert variant="info" title={REVIEW_NOTES[listing.moderation]?.title ?? REVIEW_NOTES.APPROVED.title}>
            {t(REVIEW_NOTES[listing.moderation]?.text ?? REVIEW_NOTES.APPROVED.text)}
            {listing.moderation === 'BLOCKED' && listing.moderationNote && <span className="mt-1 block">{t('Admin’s note:')} “{listing.moderationNote}”</span>}
          </Alert>
          {isSampleData && (
            <Alert variant="warning" title={t("Saving isn’t connected yet")}>
              {t("You can edit and check the form, but changes can’t be saved until the UniMarket backend is ready.")}
            </Alert>
          )}
        </div>
      )}

      {content}
    </PageContainer>
  )
}
