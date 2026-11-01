import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import ImageSlot from '../ui/ImageSlot'
import useTranslation from '../../i18n/useTranslation'

/**
 * Product photo gallery: large photo + thumbnails. With several photos it also offers
 * previous/next buttons and ←/→ keys. A listing without photos shows a placeholder.
 */
export default function ProductImageGallery({ images = [], title }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const count = images.length
  const hasMany = count > 1
  const show = (next) => setIndex((next + count) % count)

  const frame = 'relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-subtle'

  if (count === 0) {
    return (
      <div className={frame}>
        <ImageSlot alt={t('No photo available for {title}', { title })} className="h-full w-full" />
      </div>
    )
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('Photos of {title}', { title })}
      className="flex flex-col gap-3"
      onKeyDown={(event) => {
        if (!hasMany) return
        if (event.key === 'ArrowLeft') show(index - 1)
        if (event.key === 'ArrowRight') show(index + 1)
      }}
    >
      <div className={frame}>
        <img src={images[index]} alt={t('{title}, photo {number} of {count}', { title, number: index + 1, count })} className="h-full w-full object-cover" />

        {hasMany && (
          <>
            <button
              type="button"
              onClick={() => show(index - 1)}
              aria-label={t("Previous photo")}
              className="absolute top-1/2 left-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm hover:bg-surface"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => show(index + 1)}
              aria-label={t("Next photo")}
              className="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm hover:bg-surface"
            >
              <ChevronRightIcon className="size-5" />
            </button>
            <p className="absolute right-3 bottom-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white" aria-live="polite">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>

      {hasMany && (
        <ul className="grid grid-cols-5 gap-2" aria-label={t("Choose photo")}>
          {images.map((src, thumbIndex) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setIndex(thumbIndex)}
                aria-label={t('Show photo {number}', { number: thumbIndex + 1 })}
                aria-current={thumbIndex === index ? 'true' : undefined}
                className={`block aspect-square w-full overflow-hidden rounded-control border-2 transition-colors ${
                  thumbIndex === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
