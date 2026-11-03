import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildIndex, searchIndex } from '../../utils/institutionSearch'
import { CheckIcon, GraduationCapIcon, SearchIcon, XIcon } from '../icons'
import FieldError from '../ui/FieldError'
import useTranslation from '../../i18n/useTranslation'

const MAX_RESULTS = 40
const NOT_LISTED = '__not_listed__'

const TYPE_LABELS = {
  UNIVERSITY: 'University',
  ACADEMY: 'Academy',
  PEDAGOGICAL_COLLEGE: 'Pedagogical college',
}

/**
 * Searchable university / academy / college picker (WAI-ARIA combobox with a listbox popup).
 * Options: official UniMarket campuses (submitted as campusId), entries of the Ministry-sourced directory
 * (submitted as the canonical name in universityName, self-declared) and "My university is not listed".
 * Keyboard: type to search, ↑/↓ to move, Enter to choose, Esc to close. Works with or without Vietnamese accents.
 *
 * @param {{ id: number, name: string, university: string }[]} campuses official campuses (may be empty)
 * @param {object[]} directory institutions from vnHigherEducationDirectory.json (may still be loading)
 * @param {{ kind: 'campus'|'directory', label: string }|null} selection current choice
 * @param {(choice: { kind: 'campus', campus: object } | { kind: 'directory', institution: object } | { kind: 'manual' } | null) => void} onSelect
 */
export default function UniversityPicker({ campuses, directory, isLoading, selection, onSelect, error }) {
  const { t } = useTranslation()
  const id = useId()
  const listId = `${id}-list`
  const errorId = error ? `${id}-error` : undefined
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [active, setActive] = useState(0)

  const campusIndex = useMemo(
    () =>
      buildIndex(
        (campuses ?? []).map((campus) => ({
          id: `campus-${campus.id}`,
          name: `${campus.university} · ${campus.name}`,
          aliases: [campus.university, campus.name],
          campus,
        })),
      ),
    [campuses],
  )
  const directoryIndex = useMemo(() => buildIndex(directory ?? []), [directory])

  const options = useMemo(() => {
    if (!query.trim()) return []
    const official = searchIndex(campusIndex, query, 5).map((entry) => ({ key: entry.id, kind: 'campus', entry }))
    const listed = searchIndex(directoryIndex, query, MAX_RESULTS).map((entry) => ({ key: entry.id, kind: 'directory', entry }))
    return [...official, ...listed, { key: NOT_LISTED, kind: 'manual' }]
  }, [campusIndex, directoryIndex, query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(option) {
    setIsOpen(false)
    setQuery('')
    if (option.kind === 'campus') onSelect({ kind: 'campus', campus: option.entry.campus })
    else if (option.kind === 'directory') onSelect({ kind: 'directory', institution: option.entry })
    else onSelect({ kind: 'manual' })
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setActive((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && isOpen && options[active]) {
      event.preventDefault()
      choose(options[active])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  if (selection) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('Your university, academy or college')}</span>
        <div className="flex items-start gap-3 rounded-control border border-primary bg-primary-soft px-3 py-2.5">
          <GraduationCapIcon className="mt-0.5 size-4.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{selection.label}</p>
            <p className="text-xs text-ink-muted">
              {selection.kind === 'campus'
                ? t('Official UniMarket campus')
                : t('Shown on your profile as self-declared. UniMarket does not verify enrolment.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null)
              window.setTimeout(() => inputRef.current?.focus(), 0)
            }}
            aria-label={t('Change university')}
            className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  const activeOption = isOpen ? options[active] : undefined
  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-ink">
        {t('Your university, academy or college')}
      </label>
      <div className={`flex h-12 items-center gap-2 rounded-control border bg-surface px-3 focus-within:ring-2 focus-within:ring-primary/30 ${error ? 'border-danger' : 'border-line focus-within:border-primary'}`}>
        <SearchIcon className="size-4.5 shrink-0 text-ink-muted" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          name="affiliationType"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={isOpen && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId ?? `${id}-hint`}
          placeholder={isLoading ? t('Loading the university list…') : t('Search, e.g. Bách khoa, dai hoc Can Tho, Học viện')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setIsOpen(true)
          }}
          onFocus={() => query && setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      {isOpen && options.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t('Matching schools')}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-pop"
        >
          {options.map((option, index) => {
            const isActive = index === active
            const base = `flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm ${isActive ? 'bg-subtle' : ''}`
            return (
              <li
                key={option.key}
                id={`${id}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isActive}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={option.kind === 'manual' ? `${base} mt-1 border-t border-line text-primary` : base}
              >
                {option.kind === 'manual' ? (
                  <span className="font-medium">{t('My university is not listed — type its name')}</span>
                ) : (
                  <>
                    {isActive ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" /> : <span className="size-4 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">{option.entry.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {option.kind === 'campus' ? t('Official UniMarket campus') : t(TYPE_LABELS[option.entry.type] ?? 'University')}
                      </span>
                    </span>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {errorId ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {t('Type a few words with or without accents. List: Ministry of Education and Training (MOET), quality-accredited institutions, updated 30/9/2026.')}{' '}
          <button
            type="button"
            onClick={() => onSelect({ kind: 'manual' })}
            className="font-medium text-primary hover:underline"
          >
            {t('My university is not listed')}
          </button>
        </p>
      )}
    </div>
  )
}
