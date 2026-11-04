import demoPhotos from '../data/demoProductPhotos.json' with { type: 'json' }

/**
 * Seeded demo listings (V001) store image references like `/images/demo/products/item-07-front.svg` in the database.
 * No such SVG is shipped any more. Without changing those rows, the frontend maps each reference to a locally stored,
 * openly licensed REFERENCE PHOTO of that product (WebP under /images/demo/products/photos/), listed with its source,
 * author and licence in src/data/demoProductPhotos.json (written by scripts/process-demo-photos.py).
 *
 * A demo reference without a verified photo maps to NO image, so the UI shows its neutral placeholder: it is never
 * replaced by an illustration or by a photo of another product. Any other URL (uploads under /media/products/,
 * absolute URLs) is returned unchanged.
 */
const DEMO_REF = /\/images\/demo\/products\/item-(\d{2})-(front|detail)\.svg$/

/** True for a seeded demo image reference (whether or not a photo exists for it). */
export function isDemoReference(src) {
  return typeof src === 'string' && DEMO_REF.test(src)
}

/** @returns {{ url: string, credit: object } | null} the verified reference photo for a seeded demo image reference */
export function demoPhotoFor(src) {
  const match = typeof src === 'string' ? src.match(DEMO_REF) : null
  const entry = match && demoPhotos[match[1]]?.[match[2]]
  return entry ? { url: `/images/demo/products/photos/${entry.file}`, credit: entry } : null
}

/** The URL to load for an image reference: the reference photo for demo rows (or null), the URL itself otherwise. */
export function resolveImageUrl(src) {
  if (!src) return null
  if (isDemoReference(src)) return demoPhotoFor(src)?.url ?? null
  return src
}
