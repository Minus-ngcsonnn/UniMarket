import Button from '../ui/Button'

/**
 * "What happens next" message with the actions available to this person (from utils/orderFlow nextStep).
 * In sample mode it can also offer "Simulate … step" to play the other person's turn.
 *
 * @param {{ text: string, actions: { key, label, variant }[] }} step
 * @param {(actionKey: string) => void} onAction
 * @param {'stacked'|'inline'} [layout] inline: message and buttons side by side on wide screens
 */
export default function OrderNextStep({ step, canSimulate, otherParty, busyAction, onAction, layout = 'inline' }) {
  const hasButtons = step.actions.length > 0 || canSimulate
  return (
    <div className={`flex flex-col gap-3 rounded-control bg-subtle px-4 py-3 ${layout === 'inline' ? 'sm:flex-row sm:items-center sm:justify-between' : ''}`}>
      <p className="text-sm text-ink">{step.text}</p>
      {hasButtons && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {step.actions.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant={action.variant}
              loading={busyAction === action.key}
              disabled={Boolean(busyAction)}
              onClick={() => onAction(action.key)}
            >
              {action.label}
            </Button>
          ))}
          {canSimulate && (
            <Button
              size="sm"
              variant="ghost"
              loading={busyAction === 'simulate'}
              disabled={Boolean(busyAction)}
              onClick={() => onAction('simulate')}
              title="Sample data only: performs the other person’s next step"
            >
              Simulate {otherParty} step
              <span className="rounded bg-warning-soft px-1 text-[10px] font-semibold text-ink">DEMO</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
