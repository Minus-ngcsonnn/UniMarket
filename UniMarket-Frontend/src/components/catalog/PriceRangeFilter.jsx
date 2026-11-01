import { useState } from 'react'
import { PRICE_FILTER_MAX, PRICE_FILTER_STEP } from '../../constants/product'
import { formatNumber, parseDigits } from '../../utils/format'

const thumbClasses =
  'pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent focus:outline-none ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface ' +
  'focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-primary/20'

const inputClasses =
  'h-10 w-full min-w-0 rounded-control border border-line bg-surface px-2.5 text-[13px] text-ink tabular-nums focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none'

/**
 * Price range filter (Figma): two-thumb slider plus "Min price" / "Max price" fields, in VND.
 * Changes are applied when a thumb is released, an arrow key is released, or a field loses focus / Enter.
 * The parent remounts it (key) when the URL values change from elsewhere, e.g. "Clear all".
 *
 * @param {number|null} min current minimum (null = no minimum)
 * @param {number|null} max current maximum (null = no maximum)
 * @param {(min: number|null, max: number|null) => void} onCommit
 */
export default function PriceRangeFilter({ min, max, onCommit }) {
  const [low, setLow] = useState(min ?? 0)
  const [high, setHigh] = useState(max ?? PRICE_FILTER_MAX)

  function commit(nextLow, nextHigh) {
    const lo = Math.max(0, Math.min(nextLow, nextHigh))
    const hi = Math.min(PRICE_FILTER_MAX, Math.max(nextLow, nextHigh))
    setLow(lo)
    setHigh(hi)
    const committedMin = lo > 0 ? lo : null
    const committedMax = hi < PRICE_FILTER_MAX ? hi : null
    if (committedMin !== min || committedMax !== max) onCommit(committedMin, committedMax)
  }

  // Commits read the value straight from the element that fired the event, so they never use a
  // stale state value (e.g. typing and leaving the field before React re-renders).
  const toLow = (text) => parseDigits(text) ?? 0
  const toHigh = (text) => Math.min(PRICE_FILTER_MAX, parseDigits(text) ?? PRICE_FILTER_MAX)
  const isRangeKey = (key) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)
  const percent = (value) => (value / PRICE_FILTER_MAX) * 100

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-5">
        <div className="absolute top-1/2 right-2.5 left-2.5 h-1 -translate-y-1/2 rounded-full bg-line" />
        {/* Selected range. A 20px thumb's centre moves from 10px to (width - 10px): offset = p% + (10 - 0.2p)px */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{
            left: `calc(${percent(low)}% + ${10 - percent(low) * 0.2}px)`,
            right: `calc(${100 - percent(high)}% + ${10 - (100 - percent(high)) * 0.2}px)`,
          }}
        />
        <input
          type="range"
          min={0}
          max={PRICE_FILTER_MAX}
          step={PRICE_FILTER_STEP}
          value={low}
          aria-label="Minimum price"
          aria-valuetext={`${formatNumber(low)} ₫`}
          onChange={(event) => setLow(Math.min(Number(event.target.value), high - PRICE_FILTER_STEP))}
          onPointerUp={(event) => commit(Number(event.currentTarget.value), high)}
          onKeyUp={(event) => isRangeKey(event.key) && commit(Number(event.currentTarget.value), high)}
          className={thumbClasses}
        />
        <input
          type="range"
          min={0}
          max={PRICE_FILTER_MAX}
          step={PRICE_FILTER_STEP}
          value={high}
          aria-label="Maximum price"
          aria-valuetext={high >= PRICE_FILTER_MAX ? `${formatNumber(high)} ₫ or more` : `${formatNumber(high)} ₫`}
          onChange={(event) => setHigh(Math.max(Number(event.target.value), low + PRICE_FILTER_STEP))}
          onPointerUp={(event) => commit(low, Number(event.currentTarget.value))}
          onKeyUp={(event) => isRangeKey(event.key) && commit(low, Number(event.currentTarget.value))}
          className={thumbClasses}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          Min price (₫)
          <input
            inputMode="numeric"
            value={formatNumber(low)}
            onChange={(event) => setLow(toLow(event.target.value))}
            onBlur={(event) => commit(toLow(event.currentTarget.value), high)}
            onKeyDown={(event) => event.key === 'Enter' && commit(toLow(event.currentTarget.value), high)}
            className={inputClasses}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          Max price (₫)
          <input
            inputMode="numeric"
            value={high >= PRICE_FILTER_MAX ? '' : formatNumber(high)}
            placeholder="No limit"
            onChange={(event) => setHigh(toHigh(event.target.value))}
            onBlur={(event) => commit(low, toHigh(event.currentTarget.value))}
            onKeyDown={(event) => event.key === 'Enter' && commit(low, toHigh(event.currentTarget.value))}
            className={inputClasses}
          />
        </label>
      </div>
    </div>
  )
}
