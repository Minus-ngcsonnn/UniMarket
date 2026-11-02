import { useEffect, useRef } from 'react'

const VARIANTS = {
  center: 'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-2xl',
  drawer: 'my-0 mr-auto ml-0 h-dvh max-h-dvh w-[min(22rem,88vw)] rounded-r-2xl',
}

/**
 * Modal dialog built on the native <dialog> element (focus trap, Esc to close, inert background).
 * Mount it to open it; when it closes (Esc, backdrop click, or a child calling onClose) the parent
 * should unmount it.
 *
 * @param {'center'|'drawer'} [variant] centered box or left-side drawer (mobile filters)
 * @param {string} labelledBy id of the element that names the dialog
 */
export default function Modal({ onClose, labelledBy, variant = 'center', className = '', children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onClose={onClose}
      // A click on the <dialog> element itself (not its content) is a click on the backdrop.
      onClick={(event) => event.target === dialogRef.current && dialogRef.current.close()}
      className={`overflow-y-auto bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/50 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </dialog>
  )
}
