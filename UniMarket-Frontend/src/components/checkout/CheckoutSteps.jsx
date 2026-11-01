const STEPS = ['Cart', 'Checkout', 'Confirmation']

/** "01 Cart — 02 Checkout — 03 Confirmation" indicator from the Figma shopping cart. */
export default function CheckoutSteps({ current }) {
  const currentIndex = STEPS.indexOf(current)
  return (
    <ol aria-label="Checkout steps" className="flex items-center gap-3 text-sm">
      {STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-3">
          {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-line sm:w-8" />}
          <span
            aria-current={index === currentIndex ? 'step' : undefined}
            className={index === currentIndex ? 'font-semibold text-primary' : index < currentIndex ? 'text-ink' : 'text-ink-muted'}
          >
            <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span> {step}
          </span>
        </li>
      ))}
    </ol>
  )
}
