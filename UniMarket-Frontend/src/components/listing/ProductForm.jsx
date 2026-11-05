import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { LISTING_LIMITS, UNIVERSITY_NAME } from '../../constants/product'
import useCatalogReference from '../../hooks/useCatalogReference'
import useForm from '../../hooks/useForm'
import useSession from '../../hooks/useSession'
import { locationLabelOf } from '../../services/products/productMapper'
import { formatNumber, parseDigits } from '../../utils/format'
import { validateListing } from '../../utils/listingValidation'
import { ArrowRightIcon, CheckCircleIcon, ShieldCheckIcon } from '../icons'
import ProductCard from '../product/ProductCard'
import Button from '../ui/Button'
import { buttonClasses } from '../ui/buttonClasses'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import ConditionPicker from './ConditionPicker'
import DescriptionGuide from './DescriptionGuide'
import ImageUploader from './ImageUploader'
import useTranslation from '../../i18n/useTranslation'

/**
 * Where the item is (V003). Sample data: one of the FPT campuses. Real API, from the signed-in account (GET /api/auth/me):
 * - official campus: a campus of the seller's university (default: their campus) + optional pickup area;
 * - self-declared university (no campus): a pickup area is required and no campus can be sent.
 */
function useListingLocation() {
  const { reference } = useCatalogReference()
  const auth = useSession()
  if (reference.source === 'sample') {
    return {
      mode: 'campus',
      campusOptions: reference.campuses.map((c) => ({ value: c.key, label: `${UNIVERSITY_NAME} · ${c.label}` })),
      zoneOptions: [],
      reference,
    }
  }
  const user = auth.user
  const campusId = user?.affiliation?.campusId ?? user?.campusId ?? null
  const ownCampus = reference.campuses.find((c) => String(c.id) === String(campusId))
  const zoneOptions = reference.zones.map((zone) => ({ value: String(zone.id), label: `${zone.name} — ${zone.province}` }))
  if (campusId == null) {
    return { mode: 'zone', campusOptions: [], zoneOptions, university: user?.affiliation?.universityName ?? user?.university ?? null, reference }
  }
  return {
    mode: 'campus',
    campusOptions: reference.campuses
      .filter((c) => !ownCampus || c.universityId === ownCampus.universityId)
      .map((c) => ({ value: c.key, label: `${c.university} · ${c.label}` })),
    zoneOptions: [{ value: '', label: 'Campus area (default)' }, ...zoneOptions],
    reference,
  }
}

const TIPS = [
  'Use bright, clear photos. The first photo is the cover.',
  'Mention edition, model or size in the title.',
  'Be honest about wear and anything missing.',
  'Check similar listings to set a fair price.',
]

function FormSection({ title, description, children }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t(title)}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{t(description)}</p>}
      </div>
      {children}
    </section>
  )
}

/** Props for a VND amount field: shows "1.250.000", stores 1250000 (or null). */
function priceFieldProps(form, name) {
  const props = form.getFieldProps(name)
  return {
    ...props,
    inputMode: 'numeric',
    value: props.value == null ? '' : formatNumber(props.value),
    onChange: (event) => props.onChange({ target: { name, value: parseDigits(event.target.value) } }),
    endAdornment: <span className="pr-2 text-sm text-ink-muted">₫</span>,
  }
}

/**
 * Listing form shared by Create Listing and Edit Listing (approved layout: form + live preview).
 *
 * @param {object} initialValues see EMPTY_LISTING in constants/product.js
 * @param {(values) => {t("Promise")}<void>} onSubmit called with valid values
 * @param {string} submitLabel e.g. "Publish listing" / "Save changes"
 * @param {string} cancelTo where "Cancel" goes
 * @param {React.ReactNode} [notice] result message shown under the actions
 * @param {object} [serverErrors] field errors returned by the backend ({ field: message })
 * @param {number|null} [uploadProgress] 0–100 while photos are uploading
 */
export default function ProductForm({ initialValues, onSubmit, submitLabel, cancelTo, notice, serverErrors, uploadProgress = null }) {
  const { t } = useTranslation()
  const location = useListingLocation()
  // V005 "Other" category: the seller types the product's category; the typed value is kept while switching categories.
  const isCustomCategory = (slug) => Boolean(location.reference.categories.find((c) => c.slug === slug)?.custom)
  const form = useForm({
    initialValues,
    validate: (values) => validateListing(values, { location: location.mode, customCategory: isCustomCategory(values.categorySlug) }),
    onSubmit,
  })
  const categoryOptions = location.reference.categories.map((c) => ({ value: c.slug, label: t(c.name) }))
  const { setServerErrors } = form

  // Show the backend's field errors next to their fields (each one disappears when its field changes).
  useEffect(() => {
    if (serverErrors) setServerErrors(serverErrors)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-apply only when a new set of errors arrives
  }, [serverErrors])
  const [previewTime] = useState(() => new Date().toISOString())
  const descriptionRef = useRef(null)
  const { values } = form

  /** Applies a suggestion from the guide and puts the caret at the end, ready to type the detail. */
  function insertIntoDescription(next) {
    form.setFieldValue('description', next.slice(0, LISTING_LIMITS.descriptionMax))
    setTimeout(() => {
      const field = descriptionRef.current
      if (!field) return
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    }, 0)
  }

  const preview = {
    id: 0,
    title: values.title.trim() || t('Your item title'),
    price: values.price,
    originalPrice: values.originalPrice,
    condition: values.condition || 'LIKE_NEW',
    campus: values.campus,
    locationLabel:
      location.reference.source === 'sample'
        ? undefined
        : locationLabelOf(
            location.reference.campuses.find((c) => c.key === values.campus) && { name: location.reference.campuses.find((c) => c.key === values.campus).label },
            location.reference.zones.find((z) => String(z.id) === values.pickupZone),
          ),
    images: values.photos.map((photo) => photo.url),
    createdAt: previewTime,
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-5">
        <FormSection title={t("Photos")} description={t('Add up to {count} photos. Buyers see the first one in search results.', { count: LISTING_LIMITS.photosMax })}>
          <ImageUploader
            label={t("Item photos")}
            photos={values.photos}
            onChange={(photos) => form.setFieldValue('photos', photos)}
            error={form.getError('photos')}
          />
        </FormSection>

        <FormSection title={t("Details")} description={t("Help buyers understand exactly what you’re selling.")}>
          <Input
            label={t("Title")}
            placeholder={t("e.g. Calculus: Early Transcendentals, 9th edition")}
            maxLength={LISTING_LIMITS.titleMax}
            hint={`${values.title.length} / ${LISTING_LIMITS.titleMax} characters`}
            {...form.getFieldProps('title')}
          />
          <Select
            label={t("Category")}
            name="categorySlug"
            placeholder={t("Choose a category")}
            options={categoryOptions}
            value={values.categorySlug}
            onChange={(slug) => form.setFieldValue('categorySlug', slug)}
            onBlur={form.getFieldProps('categorySlug').onBlur}
            error={form.getError('categorySlug')}
          />
          {isCustomCategory(values.categorySlug) && (
            <Input
              label={t('Specify product category')}
              placeholder={t('E.g. Musical instruments, Art supplies...')}
              maxLength={LISTING_LIMITS.customCategoryMax}
              hint={`${(values.customCategory ?? '').length} / ${LISTING_LIMITS.customCategoryMax} characters`}
              {...form.getFieldProps('customCategory')}
            />
          )}
          <ConditionPicker
            value={values.condition}
            onChange={(condition) => form.setFieldValue('condition', condition)}
            error={form.getError('condition')}
          />
          <div className="flex flex-col gap-3">
            <Textarea
              ref={descriptionRef}
              label={t("Description")}
              placeholder={t("Describe the item: what it is, its condition, what’s included and why you’re selling. Use the suggestions below.")}
              maxLength={LISTING_LIMITS.descriptionMax}
              rows={7}
              {...form.getFieldProps('description')}
            />
            <DescriptionGuide categorySlug={values.categorySlug} description={values.description} onChange={insertIntoDescription} />
          </div>
        </FormSection>

        <FormSection title={t("Price")} description={t("Prices are in Vietnamese dong. Listing is always free.")}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label={t("Your price")} placeholder="e.g. 450.000" {...priceFieldProps(form, 'price')} />
            <Input
              label={t("Original price (optional)")}
              placeholder="e.g. 1.350.000"
              hint={t("Shown crossed out, so buyers see the saving.")}
              {...priceFieldProps(form, 'originalPrice')}
            />
          </div>
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
            {t("Buyers pay online through UniMarket. Never ask buyers to pay you directly.")}
          </p>
        </FormSection>

        {location.mode === 'zone' ? (
          <FormSection title={t('Pickup area')} description={t('Where buyers can pick up the item. Areas are approximate and used for shipping estimates.')}>
            {location.university && (
              <p className="text-sm text-ink-muted">{t('Your university: {name} (self-declared)', { name: location.university })}</p>
            )}
            <Select
              label={t('Pickup area')}
              name="pickupZone"
              placeholder={t('Choose an area')}
              options={location.zoneOptions}
              value={values.pickupZone}
              onChange={(zone) => form.setFieldValue('pickupZone', zone)}
              onBlur={form.getFieldProps('pickupZone').onBlur}
              error={form.getError('pickupZone')}
            />
          </FormSection>
        ) : (
          <FormSection title={t("Campus")} description={t("Where the item is. Buyers can filter by campus.")}>
            <Select
              label={t("Campus")}
              name="campus"
              options={location.campusOptions}
              value={values.campus}
              onChange={(campus) => form.setFieldValue('campus', campus)}
              error={form.getError('campus')}
            />
            {location.zoneOptions.length > 0 && (
              <Select
                label={t('Pickup area (optional)')}
                name="pickupZone"
                options={location.zoneOptions.map((option) => ({ ...option, label: t(option.label) }))}
                value={values.pickupZone}
                onChange={(zone) => form.setFieldValue('pickupZone', zone)}
                hint={t('Only if you hand over the item somewhere other than your campus.')}
                error={form.getError('pickupZone')}
              />
            )}
          </FormSection>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link to={cancelTo} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              {t("Cancel")}
            </Link>
            <Button type="submit" size="lg" loading={form.isSubmitting} disabled={form.isSubmitting}>
              {submitLabel}
              <ArrowRightIcon className="size-4.5" />
            </Button>
          </div>
          {uploadProgress != null && (
            <p className="text-right text-sm text-ink-muted" role="status" aria-live="polite">
              {uploadProgress < 100 ? t('Uploading photos… {percent}%', { percent: uploadProgress }) : t('Photos uploaded. Saving…')}
            </p>
          )}
          {notice}
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-36" aria-label={t("Listing preview")}>
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{t("Live preview")}</p>
        <div className="max-w-xs lg:max-w-none">
          <ProductCard product={preview} preview />
        </div>
        <div className="rounded-card bg-subtle p-4">
          <p className="text-sm font-semibold text-ink">{t("Tips for a great listing")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {TIPS.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-xs text-ink-muted">
                <CheckCircleIcon className="mt-px size-3.5 shrink-0 text-primary" />
                {t(tip)}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </form>
  )
}
