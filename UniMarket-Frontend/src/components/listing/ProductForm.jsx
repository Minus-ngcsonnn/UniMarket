import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { CATEGORIES } from '../../constants/categories'
import { CAMPUSES, CAMPUS_KEYS, LISTING_LIMITS, UNIVERSITY_NAME } from '../../constants/product'
import useForm from '../../hooks/useForm'
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

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))
const CAMPUS_OPTIONS = CAMPUS_KEYS.map((key) => ({ value: key, label: `${UNIVERSITY_NAME} · ${CAMPUSES[key].label}` }))

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
 */
export default function ProductForm({ initialValues, onSubmit, submitLabel, cancelTo, notice }) {
  const { t } = useTranslation()
  const form = useForm({ initialValues, validate: validateListing, onSubmit })
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
            error={form.touched.photos ? form.errors.photos : undefined}
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
            options={CATEGORY_OPTIONS}
            value={values.categorySlug}
            onChange={(slug) => form.setFieldValue('categorySlug', slug)}
            onBlur={form.getFieldProps('categorySlug').onBlur}
            error={form.touched.categorySlug ? form.errors.categorySlug : undefined}
          />
          <ConditionPicker
            value={values.condition}
            onChange={(condition) => form.setFieldValue('condition', condition)}
            error={form.touched.condition ? form.errors.condition : undefined}
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

        <FormSection title={t("Campus")} description={t("Where the item is. Buyers can filter by campus.")}>
          <Select
            label={t("Campus")}
            name="campus"
            options={CAMPUS_OPTIONS}
            value={values.campus}
            onChange={(campus) => form.setFieldValue('campus', campus)}
            error={form.touched.campus ? form.errors.campus : undefined}
          />
        </FormSection>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link to={cancelTo} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              {t("Cancel")}
            </Link>
            <Button type="submit" size="lg" loading={form.isSubmitting}>
              {submitLabel}
              <ArrowRightIcon className="size-4.5" />
            </Button>
          </div>
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
