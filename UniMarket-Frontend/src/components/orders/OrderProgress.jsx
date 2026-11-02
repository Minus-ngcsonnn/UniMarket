import { ORDER_STEPS } from '../../constants/order'
import { CheckIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/** Five-step tracker of the Business Plan order flow: Ordered → Confirmed → Paid → Delivering → Received. */
export default function OrderProgress({ status }) {
  const { t } = useTranslation()
  if (status === 'CANCELLED') return null
  const currentIndex = ORDER_STEPS.findIndex((step) => step.status === status)

  return (
    <ol aria-label={t("Order progress")} className="grid grid-cols-5 gap-1">
      {ORDER_STEPS.map((step, index) => {
        const isDone = index < currentIndex || status === 'COMPLETED'
        const isCurrent = index === currentIndex && status !== 'COMPLETED'
        return (
          <li key={step.status} aria-current={isCurrent ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${isDone ? 'bg-primary' : isCurrent ? 'bg-primary/50' : 'bg-line'}`} />
            <span className={`flex items-center gap-1 text-[11px] ${isDone || isCurrent ? 'font-medium text-ink' : 'text-ink-muted'}`}>
              {isDone && <CheckIcon className="size-3 text-primary" />}
              <span className="truncate">{t(step.label)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
