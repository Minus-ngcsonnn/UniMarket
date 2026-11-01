import { useId } from 'react'
import { CONDITIONS, CONDITION_KEYS } from '../../constants/product'
import FieldError from '../ui/FieldError'

const HINTS = {
  NEW: 'Never used, may still be in its packaging.',
  LIKE_NEW: 'Used briefly, no visible signs of wear.',
  USED: 'Shows some wear but works as it should.',
}

/** Condition choice for a listing (Business Plan values: New / Like new / Used), as selectable cards. */
export default function ConditionPicker({ value, onChange, error, name = 'condition' }) {
  const groupId = useId()
  const errorId = error ? `${groupId}-error` : undefined

  return (
    <fieldset aria-describedby={errorId} className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink">Condition</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {CONDITION_KEYS.map((key) => {
          const isSelected = value === key
          return (
            <label
              key={key}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-control border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                isSelected ? 'border-primary bg-primary-soft' : error ? 'border-danger' : 'border-line hover:border-ink-muted/40'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={key}
                checked={isSelected}
                onChange={() => onChange(key)}
                aria-invalid={error ? true : undefined}
                className="sr-only"
              />
              <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-ink'}`}>{CONDITIONS[key].label}</span>
              <span className="text-xs text-ink-muted">{HINTS[key]}</span>
            </label>
          )
        })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  )
}
