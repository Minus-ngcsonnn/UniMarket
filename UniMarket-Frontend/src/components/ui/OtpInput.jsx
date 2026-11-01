import { useId, useRef } from 'react'
import FieldError from './FieldError'

/**
 * One-time code input: one box per digit.
 * Supports typing, pasting the whole code, Backspace/arrow navigation and browser one-time-code autofill.
 *
 * @param {string} value the digits entered so far (e.g. "1234")
 * @param {(value: string) => void} onChange receives the new digit string
 * @param {number} [length] number of digits
 */
export default function OtpInput({ label, value, onChange, error, length = 6, id }) {
  const inputRefs = useRef([])
  const generatedId = useId()
  const groupId = id ?? generatedId
  const errorId = error ? `${groupId}-error` : undefined
  const digits = Array.from({ length }, (_, index) => value[index] ?? '')

  function focusBox(index) {
    inputRefs.current[Math.max(0, Math.min(index, length - 1))]?.focus()
  }

  function fillFrom(startIndex, typed) {
    const next = [...digits]
    for (let offset = 0; offset < typed.length && startIndex + offset < length; offset++) {
      next[startIndex + offset] = typed[offset]
    }
    onChange(next.join(''))
    focusBox(startIndex + typed.length)
  }

  function handleChange(index, event) {
    const typed = event.target.value.replace(/\D/g, '')
    if (!typed) {
      const next = [...digits]
      next[index] = ''
      onChange(next.join(''))
      return
    }
    fillFrom(index, typed)
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      const next = [...digits]
      next[index - 1] = ''
      onChange(next.join(''))
      focusBox(index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    event.preventDefault()
    fillFrom(0, pasted)
  }

  return (
    <fieldset aria-describedby={errorId} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-ink">{label}</legend>
      <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputRefs.current[index] = element
            }}
            id={index === 0 ? groupId : undefined}
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            className={`h-12 w-full rounded-control border bg-surface text-center text-lg font-semibold text-ink transition-colors focus:ring-2 focus:outline-none sm:h-14 ${
              error ? 'border-danger focus:ring-danger/20' : 'border-line focus:border-primary focus:ring-primary/20'
            }`}
          />
        ))}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  )
}
