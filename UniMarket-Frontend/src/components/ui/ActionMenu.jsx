import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { MoreHorizontalIcon } from '../icons'

/**
 * "⋯" row-actions menu (Figma admin dashboard table style).
 * Keyboard: Enter/Space/ArrowDown open and focus the first item; Arrow keys move; Esc closes.
 *
 * @param {string} label accessible name of the trigger, e.g. "Actions for Calculus…"
 * @param {{ label: string, Icon?: Function, to?: string, onSelect?: Function, danger?: boolean }[]} items
 * @param {React.ReactNode} [heading] small caption at the top of the menu (e.g. "Listing UM-2048")
 * @param {Function} [icon] trigger icon (default "⋯")
 * @param {string} [triggerClassName] replaces the default trigger size/shape classes
 */
export default function ActionMenu({ label, items, heading, icon: TriggerIcon = MoreHorizontalIcon, iconClassName = 'size-5', triggerClassName = 'size-9 rounded-control' }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    if (!isOpen) return undefined
    itemRefs.current[0]?.focus()
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function close() {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function handleMenuKeyDown(event) {
    const focusable = itemRefs.current.filter(Boolean)
    const index = focusable.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusable[(index + 1) % focusable.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusable[(index - 1 + focusable.length) % focusable.length]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      setIsOpen(false)
    }
  }

  const itemClass = (danger) =>
    `flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors focus:outline-none ${
      danger ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'text-ink hover:bg-primary-soft focus:bg-primary-soft'
    }`

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        className={`flex items-center justify-center transition-colors ${triggerClassName} ${
          isOpen ? 'bg-primary-soft text-primary ring-1 ring-primary/30' : 'text-ink-muted hover:bg-subtle hover:text-ink'
        }`}
      >
        <TriggerIcon className={iconClassName} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full right-0 z-30 mt-1 min-w-44 rounded-control border border-line bg-surface p-1 shadow-lg shadow-ink/10"
        >
          {heading && <p className="px-3 pt-1.5 pb-1 text-xs text-ink-muted">{heading}</p>}
          {items.map(({ label: itemLabel, Icon, to, onSelect, danger }, index) => {
            const content = (
              <>
                {Icon && <Icon className="size-4 shrink-0" />}
                {itemLabel}
              </>
            )
            const ref = (element) => {
              itemRefs.current[index] = element
            }
            return to ? (
              <Link key={itemLabel} ref={ref} to={to} role="menuitem" className={itemClass(danger)} onClick={() => setIsOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={itemLabel}
                ref={ref}
                type="button"
                role="menuitem"
                className={itemClass(danger)}
                onClick={() => {
                  setIsOpen(false)
                  onSelect?.()
                }}
              >
                {content}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
