import { LISTING_LIMITS } from '../constants/product'
import { formatPrice } from './format'
import { isBlank } from './validators'

const L = LISTING_LIMITS

/**
 * Client-side validation for the Create/Edit Listing form.
 * Returns { fieldName: message } for invalid fields only. The backend must validate again.
 *
 * @param {object} values { photos, title, categorySlug, condition, description, price, originalPrice, campus }
 *   price/originalPrice are whole VND numbers or null.
 */
export function validateListing(values) {
  const errors = {}
  const title = values.title.trim()
  const description = values.description.trim()

  if (values.photos.length === 0) errors.photos = 'Add at least one photo of your item.'
  else if (values.photos.length > L.photosMax) errors.photos = `You can add up to ${L.photosMax} photos.`

  if (!title) errors.title = 'Title is required.'
  else if (title.length < L.titleMin) errors.title = `Use at least ${L.titleMin} characters.`
  else if (title.length > L.titleMax) errors.title = `Keep the title under ${L.titleMax} characters.`

  if (isBlank(values.categorySlug)) errors.categorySlug = 'Choose a category.'
  if (isBlank(values.condition)) errors.condition = 'Choose the item’s condition.'

  // Template lines with nothing after the colon (e.g. "Edition / year: ") don't count as details.
  const emptyPromptLine = /^[^:\n]{1,40}:[ \t]*$/gm
  const hasEmptyPrompts = emptyPromptLine.test(description)
  const writtenDetails = description.replace(emptyPromptLine, '').trim()

  if (!description) errors.description = 'Description is required.'
  else if (writtenDetails.length < L.descriptionMin) {
    errors.description = hasEmptyPrompts
      ? 'Fill in the details after each heading, or remove the empty ones.'
      : `Add a few more details (at least ${L.descriptionMin} characters).`
  }
  else if (description.length > L.descriptionMax) errors.description = `Keep the description under ${L.descriptionMax} characters.`

  if (values.price == null) errors.price = 'Price is required.'
  else if (values.price < L.priceMin) errors.price = `Price must be at least ${formatPrice(L.priceMin)}.`
  else if (values.price > L.priceMax) errors.price = `Price can’t be more than ${formatPrice(L.priceMax)}.`

  if (values.originalPrice != null && values.price != null && values.originalPrice <= values.price) {
    errors.originalPrice = 'The original price should be higher than your price, or leave it empty.'
  }

  if (isBlank(values.campus)) errors.campus = 'Choose your campus.'

  return errors
}

/**
 * Checks files chosen for upload (Q2: JPG/PNG/WebP, max 5 MB each, max 8 photos per listing).
 * @returns {{ accepted: File[], rejected: string[] }} rejected = human-readable reasons
 */
export function checkPhotoFiles(files, alreadySelected) {
  const accepted = []
  const rejected = []
  for (const file of files) {
    if (!L.photoTypes.includes(file.type)) {
      rejected.push(`“${file.name}” isn’t a JPG, PNG or WebP image.`)
    } else if (file.size > L.photoMaxBytes) {
      rejected.push(`“${file.name}” is larger than ${L.photoMaxBytes / 1024 / 1024} MB.`)
    } else if (alreadySelected + accepted.length >= L.photosMax) {
      rejected.push(`“${file.name}” wasn’t added: a listing can have up to ${L.photosMax} photos.`)
    } else {
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}
