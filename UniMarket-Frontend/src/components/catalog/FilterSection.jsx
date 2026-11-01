import { useId, useState } from 'react'
import useTranslation from '../../i18n/useTranslation'
import { ChevronDownIcon } from '../icons'

/** Collapsible group in the filter sidebar (Figma: title + chevron, separated by a divider). */
export default function FilterSection({ title, defaultOpen = true, children }) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <section className="border-t border-line py-5 last:pb-0">
      <h3>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center justify-between text-[15px] font-semibold text-ink"
        >
          {t(title)}
          <ChevronDownIcon className={`size-4 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      {isOpen && (
        <div id={contentId} className="mt-4">
          {children}
        </div>
      )}
    </section>
  )
}
