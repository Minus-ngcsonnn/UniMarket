import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { marketplaceUrl } from '../../routes/paths'
import { SearchIcon } from '../icons'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const SHORTCUT_LABEL = IS_MAC ? '⌘ K' : 'Ctrl K'

/**
 * Site-wide product search. Submitting opens the marketplace with ?q=<query>.
 * Ctrl+K / ⌘K focuses the field from anywhere on the page.
 */
export default function SearchBar({ initialQuery = '', className = '' }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState(initialQuery)

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  function handleSubmit(event) {
    event.preventDefault()
    navigate(marketplaceUrl({ q: query.trim() }))
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={`relative ${className}`}>
      <label htmlFor="site-search" className="sr-only">
        Search UniMarket
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-muted" />
      <input
        ref={inputRef}
        id="site-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search textbooks, tech, dorm essentials…"
        className="h-11 w-full rounded-control border border-line bg-subtle pr-4 pl-11 text-sm text-ink transition-colors placeholder:text-ink-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:outline-none md:pr-20"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-ink-muted md:block">
        {SHORTCUT_LABEL}
      </kbd>
    </form>
  )
}
