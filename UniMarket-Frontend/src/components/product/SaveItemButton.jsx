import { useEffect, useState } from 'react'
import useSaved from '../../hooks/useSaved'
import { HeartIcon } from '../icons'

/**
 * Figma "save" heart: adds the listing to Saved items (kept in this browser until accounts exist).
 * A toggle button (aria-pressed) with a short confirmation under it.
 * @param {'card'|'detail'} [variant] round button on product cards, square button on Product Detail
 * @param {string} [className] positioning of the wrapper (must be relative or absolute: the hint is placed under it)
 */
export default function SaveItemButton({ productId, title, variant = 'card', className = '' }) {
  const saved = useSaved()
  const isSaved = saved.has(productId)
  const [hint, setHint] = useState(null)

  useEffect(() => {
    if (!hint) return undefined
    const timer = setTimeout(() => setHint(null), 2000)
    return () => clearTimeout(timer)
  }, [hint])

  const shape = variant === 'card' ? 'size-8 rounded-full bg-surface shadow-sm' : 'size-12 rounded-control border border-line bg-surface'

  return (
    <div className={className || 'relative'}>
      <button
        type="button"
        aria-pressed={isSaved}
        aria-label={`Save ${title}`}
        title={isSaved ? 'Remove from saved items' : 'Save for later'}
        onClick={(event) => {
          // On product cards the button sits above the card link: don't open the listing.
          event.preventDefault()
          event.stopPropagation()
          setHint(saved.toggle(productId) ? 'Saved for later' : 'Removed from saved')
        }}
        className={`flex items-center justify-center transition-colors hover:text-primary ${isSaved ? 'text-danger' : 'text-ink'} ${shape}`}
      >
        <HeartIcon className={variant === 'card' ? 'size-4' : 'size-5'} fill={isSaved ? 'currentColor' : 'none'} />
      </button>
      <span role="status" className={`absolute top-full right-0 z-20 mt-2 ${hint ? '' : 'sr-only'}`}>
        {hint && <span className="block w-max rounded-control bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg">{hint}</span>}
      </span>
    </div>
  )
}
