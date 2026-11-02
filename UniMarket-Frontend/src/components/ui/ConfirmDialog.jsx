import { useId } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from '../icons'
import Button from './Button'
import Modal from './Modal'
import useTranslation from '../../i18n/useTranslation'

const TONES = {
  danger: { icon: AlertTriangleIcon, iconBox: 'bg-danger-soft text-danger', button: 'danger' },
  primary: { icon: CheckCircleIcon, iconBox: 'bg-primary-soft text-primary', button: 'primary' },
}

/**
 * Confirmation dialog, e.g. before deleting a listing or cancelling an order.
 * @param {'danger'|'primary'} [tone] danger for destructive actions
 * @param {React.ReactNode} [result] message shown after the action ran (keeps the dialog open)
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onClose,
  isWorking = false,
  result,
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const { icon: Icon, iconBox, button } = TONES[tone]

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex gap-4">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconBox}`}>
            <Icon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {typeof title === 'string' ? t(title) : title}
            </h2>
            <div className="text-sm text-ink-muted">{typeof message === 'string' ? t(message) : message}</div>
          </div>
        </div>

        {result}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {result ? t('Close') : t(cancelLabel)}
          </Button>
          {!result && (
            <Button variant={button} onClick={onConfirm} loading={isWorking}>
              {t(confirmLabel)}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
