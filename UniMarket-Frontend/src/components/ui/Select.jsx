import { useEffect, useId, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from '../icons'
import FieldError from './FieldError'
import useTranslation from '../../i18n/useTranslation'

const FIELD_SIZES = { md: 'h-10', lg: 'h-12' }

/**
 * Accessible single-select dropdown styled like the Figma "Sort by" control
 * (button + listbox with a check mark on the selected option).
 *
 * Keyboard: Enter/Space/Arrow keys open; Arrow keys/Home/End move; Enter/Space select; Esc/Tab close.
 *
 * @param {{ value: string, label: string }[]} options
 * @param {string} value selected option value ('' = nothing selected)
 * @param {(value: string) => void} onChange
 * @param {boolean} [hideLabel] keep the label for screen readers only
 */
export default function Select({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  onBlur,
  name,
  placeholder = 'Select…',
  error,
  hint,
  fieldSize = 'md',
  className = '',
  buttonClassName = '',
}) {
  const { t } = useTranslation()
  const id = useId()
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const containerRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = options[selectedIndex]
  const labelId = `${id}-label`
  const errorId = error ? `${id}-error` : undefined
  const hintId = hint && !error ? `${id}-hint` : undefined

  useEffect(() => {
    if (!isOpen) return undefined
    listRef.current?.focus()
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function open() {
    setActiveIndex(Math.max(0, selectedIndex))
    setIsOpen(true)
  }

  function close({ focusButton = true } = {}) {
    setIsOpen(false)
    if (focusButton) buttonRef.current?.focus()
  }

  function choose(index) {
    onChange(options[index].value)
    close()
  }

  function handleButtonKeyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      open()
    }
  }

  function handleListKeyDown(event) {
    const last = options.length - 1
    const moves = {
      ArrowDown: () => setActiveIndex((index) => Math.min(last, index + 1)),
      ArrowUp: () => setActiveIndex((index) => Math.max(0, index - 1)),
      Home: () => setActiveIndex(0),
      End: () => setActiveIndex(last),
      Enter: () => choose(activeIndex),
      ' ': () => choose(activeIndex),
      Escape: () => close(),
    }
    if (event.key === 'Tab') {
      close({ focusButton: false })
      return
    }
    if (moves[event.key]) {
      event.preventDefault()
      moves[event.key]()
    }
  }

  const stateClasses = error
    ? 'border-danger'
    : isOpen
      ? 'border-primary ring-2 ring-primary/20'
      : 'border-line hover:border-ink-muted/40'

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      <span id={labelId} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>
        {typeof label === 'string' ? t(label) : label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        name={name}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${labelId} ${id}-value`}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleButtonKeyDown}
        onBlur={() => !isOpen && onBlur?.({ target: { name } })}
        className={`flex w-full items-center justify-between gap-3 rounded-control border bg-surface px-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${FIELD_SIZES[fieldSize]} ${stateClasses} ${buttonClassName}`}
      >
        <span id={`${id}-value`} className={`truncate ${selected ? 'text-ink' : 'text-ink-muted/80'}`}>
          {t(selected ? selected.label : placeholder)}
        </span>
        <ChevronDownIcon className={`size-4 shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-180 text-primary' : ''}`} />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={`${id}-option-${activeIndex}`}
          onKeyDown={handleListKeyDown}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop focus:outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                  index === activeIndex ? 'bg-primary-soft' : ''
                } ${isSelected ? 'font-medium text-primary' : 'text-ink'}`}
              >
                {t(option.label)}
                {isSelected && <CheckIcon className="size-4 shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}

      {hintId && (
        <p id={hintId} className="text-xs text-ink-muted">
          {typeof hint === 'string' ? t(hint) : hint}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
