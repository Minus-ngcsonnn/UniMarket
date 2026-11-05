import { useState } from 'react'
import { listingFieldErrors } from '../services/products/productMapper'
import { describeApiError } from '../utils/apiErrorMessage'

/**
 * Shape sent to the product service. Photos in the order shown: new files ({ file }) or photos that already exist
 * ({ imageId, url }; imageId only with the real API).
 */
function toPayload(values) {
  return {
    title: values.title.trim(),
    categorySlug: values.categorySlug,
    customCategory: values.customCategory ?? '',
    condition: values.condition,
    description: values.description.trim(),
    price: values.price,
    originalPrice: values.originalPrice,
    campus: values.campus,
    pickupZone: values.pickupZone ?? '',
    photos: values.photos.map((photo) => (photo.file ? { file: photo.file } : { imageId: photo.imageId ?? null, url: photo.url })),
  }
}

/**
 * Submits a listing form and turns the outcome into a message for the page.
 * It never claims success unless the service reports the listing as saved. Backend field errors
 * (VALIDATION_FAILED, INVALID_CATEGORY, INVALID_ZONE, IMAGE_TOO_LARGE, …) are returned per form field.
 *
 * @param {(payload, options) => Promise<{ saved: boolean, product? }>} action e.g. productService.createListing
 * @param {{ saved: {title,text}, preview: {title,text} }} messages
 * @param {{ onSaved?: (response) => void }} [options] called after a real save (e.g. navigate away)
 * @returns {{ result, submit, serverErrors, uploadProgress }}
 */
export default function useListingSubmit(action, messages, { onSaved } = {}) {
  const [result, setResult] = useState(null)
  const [serverErrors, setServerErrors] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)

  async function submit(values) {
    setResult(null)
    setServerErrors(null)
    const hasNewPhotos = values.photos.some((photo) => photo.file)
    setUploadProgress(hasNewPhotos ? 0 : null)
    try {
      const response = await action(toPayload(values), { onUploadProgress: hasNewPhotos ? setUploadProgress : undefined })
      if (response.saved) {
        setResult({ variant: 'success', ...messages.saved })
        onSaved?.(response)
      } else {
        setResult({ variant: 'info', ...messages.preview })
      }
    } catch (error) {
      const fieldErrors = listingFieldErrors(error)
      if (Object.keys(fieldErrors).length) setServerErrors(fieldErrors)
      const described = describeApiError(error)
      setResult({
        variant: 'warning',
        title: error?.partiallySaved ? 'Partly saved' : 'Not saved',
        text:
          error?.partiallySaved
            ? `The details were saved, but a photo change failed: ${described.message} Reload the listing to see what was saved.`
            : error?.code === 'LISTING_NOT_EDITABLE'
            ? 'This listing is reserved, sold or part of an open order, so it can’t be changed now.'
            : Object.keys(fieldErrors).length
              ? 'Check the highlighted fields and try again.'
              : described.message,
      })
    } finally {
      setUploadProgress(null)
    }
  }

  return { result, submit, serverErrors, uploadProgress }
}
