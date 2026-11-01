import { useState } from 'react'
import { SearchIcon, XIcon } from '../icons'

/**
 * Search box for an admin list. Searches on Enter (and when cleared), so typing doesn't reload the table
 * on every key press.
 */
export default function AdminSearch({ value, onSearch, label, placeholder }) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  // Follow outside changes (e.g. a search from the top bar) without an effect.
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  return (
    <form
      role="search"
      className="relative w-full sm:max-w-xs"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(text.trim())
      }}
    >
      <label className="sr-only" htmlFor={`search-${label}`}>
        {label}
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        id={`search-${label}`}
        type="text"
        enterKeyHint="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-control border border-line bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-ink-muted/80 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            onSearch('')
          }}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:text-ink"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </form>
  )
}
