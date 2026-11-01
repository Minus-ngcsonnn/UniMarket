import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import useTranslation from '../../i18n/useTranslation'
import { marketplaceUrl } from '../../routes/paths'
import { SearchIcon } from '../icons'

/**
 * Site-wide product search (pill field from the approved header). Submitting opens the marketplace
 * with ?q=<query>. Ctrl+K / ⌘K focuses the field from anywhere on the page.
 * @param {boolean} [shortcut] listen for Ctrl+K (only one search field on the page should)
 */
export default function SearchBar({ initialQuery = '', className = '', shortcut = true }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const id = useId()
  const [query, setQuery] = useState(initialQuery)

  useEffect(() => {
    if (!shortcut) return undefined
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [shortcut])

  function handleSubmit(event) {
    event.preventDefault()
    navigate(marketplaceUrl({ q: query.trim() }))
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {t('search.label')}
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-muted" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search.placeholder')}
        className="h-11 w-full rounded-full border border-transparent bg-subtle pr-4 pl-11 text-sm text-ink transition-colors placeholder:text-ink-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:outline-none"
      />
    </form>
  )
}
