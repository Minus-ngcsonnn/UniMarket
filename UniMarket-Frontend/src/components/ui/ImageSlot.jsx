import { useState } from 'react'
import { ImageIcon } from '../icons'

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
 * @param {string} [src] image URL; when missing or broken a placeholder is rendered
 * @param {string} alt description; use '' for purely decorative images
 * @param {'cover'|'contain'} [fit] how the image fills its box
 * @param {string} [position] Tailwind object-position class, e.g. 'object-right'
 * @param {'light'|'onPrimary'} [tone] placeholder colors for light or blue backgrounds
 */
export default function ImageSlot({ src, alt, fit = 'cover', position = 'object-center', tone = 'light', className = '' }) {
  // Remembers which URL failed, so a new src is tried again.
  const [failedSrc, setFailedSrc] = useState(null)

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt={alt}
        onError={() => setFailedSrc(src)}
        className={`h-full w-full ${FITS[fit]} ${position} ${className}`}
      />
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
