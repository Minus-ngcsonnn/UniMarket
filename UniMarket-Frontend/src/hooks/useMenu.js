import { useEffect, useRef, useState } from 'react'

/**
 * Open/close and keyboard behaviour shared by drop-down menus (row actions, account, language).
 * - Opening focuses the first item; click outside, Esc or Tab closes; Esc returns focus to the trigger.
 * - ArrowUp/ArrowDown move between items; ArrowDown on the trigger opens the menu.
 *
 * Use: <div ref={containerRef}>, trigger <button ref={triggerRef} aria-haspopup="menu" aria-expanded={isOpen}
 * onClick={toggle} onKeyDown={onTriggerKeyDown}>, menu <div role="menu" onKeyDown={onMenuKeyDown}> and
 * ref={itemRef(index)} on every item.
 */
export default function useMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    if (!isOpen) return undefined
    itemRefs.current.find(Boolean)?.focus()
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function close({ restoreFocus = true } = {}) {
    setIsOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
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
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusable[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      focusable.at(-1)?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      setIsOpen(false)
    }
  }

  return {
    isOpen,
    close,
    containerRef,
    triggerRef,
    toggle: () => setIsOpen((open) => !open),
    /** ArrowDown on the trigger opens the menu. */
    onTriggerKeyDown: (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setIsOpen(true)
      }
    },
    onMenuKeyDown: handleMenuKeyDown,
    /** Ref callback for the item at this position (keyboard navigation). */
    itemRef: (index) => (element) => {
      itemRefs.current[index] = element
    },
  }
}
