import { useState } from 'react'

/** Shape sent to the product service. Photos: new files to upload, or URLs of photos that already exist. */
function toPayload(values) {
  return {
    title: values.title.trim(),
    categorySlug: values.categorySlug,
    condition: values.condition,
    description: values.description.trim(),
    price: values.price,
    originalPrice: values.originalPrice,
    campus: values.campus,
    photos: values.photos.map((photo) => photo.file ?? photo.url),
  }
}

/**
 * Submits a listing form and turns the outcome into a message for the page.
 * It never claims success unless the service reports the listing as saved.
 *
 * @param {(payload) => Promise<{ saved: boolean }>} action e.g. productService.createListing
 * @param {{ saved: {title,text}, preview: {title,text} }} messages
 * @returns {{ result: { variant, title, text } | null, submit: (values) => Promise<void> }}
 */
export default function useListingSubmit(action, messages) {
  const [result, setResult] = useState(null)

  async function submit(values) {
    setResult(null)
    try {
      const response = await action(toPayload(values))
      setResult(response.saved ? { variant: 'success', ...messages.saved } : { variant: 'info', ...messages.preview })
    } catch (error) {
      setResult({ variant: 'warning', title: 'Not saved', text: error.message })
    }
  }

  return { result, submit }
}
