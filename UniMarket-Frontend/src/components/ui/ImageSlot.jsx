import { useState } from 'react'
import { ImageIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'
import { demoPhotoFor, resolveImageUrl } from '../../utils/demoImages'

const PLACEHOLDER_TONES = {
  light: 'bg-subtle text-ink-muted/40',
  onPrimary: 'bg-white/10 text-white/40',
}

const FITS = {
  cover: 'object-cover',
  contain: 'object-contain',
}

/**
 * Shows an image, or a neutral placeholder while the real asset is not available
 * (no URL, or a URL that fails to load or is not an image, e.g. a deleted upload or a static-host HTML fallback page).
 *
 * Seeded demo listings show their locally stored, openly licensed reference photo (utils/demoImages.js); a demo
 * listing without a verified photo shows the placeholder (never an illustration or another product's photo).
 *
 * @param {string} [src] image URL; when missing or broken a placeholder is rendered
 * @param {string} alt description; use '' for purely decorative images
 * @param {'cover'|'contain'} [fit] how the image fills its box
 * @param {string} [position] Tailwind object-position class, e.g. 'object-right'
 * @param {'light'|'onPrimary'} [tone] placeholder colors for light or blue backgrounds
 * @param {boolean} [demoLabel] show the "Reference photo" tag on demo reference photos (cards and large views only)
 */
export default function ImageSlot({ src, alt, fit = 'cover', position = 'object-center', tone = 'light', className = '', demoLabel = false }) {
  const { t } = useTranslation()
  // Remembers which URL failed, so a new src is tried again.
  const [failedSrc, setFailedSrc] = useState(null)
  const url = resolveImageUrl(src)

  if (url && url !== failedSrc) {
    const isReferencePhoto = demoPhotoFor(src) !== null
    return (
      <span className="relative block h-full w-full">
        <img src={url} alt={alt} onError={() => setFailedSrc(url)} className={`h-full w-full ${FITS[fit]} ${position} ${className}`} />
        {demoLabel && isReferencePhoto && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-ink/65 px-2 py-0.5 text-[11px] font-medium text-white">
            {t('Reference photo')}
          </span>
        )}
      </span>
    )
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center ${PLACEHOLDER_TONES[tone]} ${className}`}
      {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
    >
      <ImageIcon className="size-10" />
    </div>
  )
}
