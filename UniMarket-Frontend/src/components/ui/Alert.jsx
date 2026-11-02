import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

const VARIANTS = {
  info: { box: 'border-primary/20 bg-primary-soft', icon: 'text-primary', Icon: InfoIcon },
  success: { box: 'border-success/30 bg-success-soft', icon: 'text-success', Icon: CheckCircleIcon },
  warning: { box: 'border-warning/40 bg-warning-soft', icon: 'text-warning', Icon: AlertTriangleIcon },
  danger: { box: 'border-danger/30 bg-danger-soft', icon: 'text-danger', Icon: AlertCircleIcon },
}

/**
 * Inline message box, e.g. a form-level error or an informational notice.
 * Danger alerts use role="alert" (announced immediately); others use role="status".
 */
export default function Alert({ variant = 'info', title, children, className = '' }) {
  const { t } = useTranslation()
  const { box, icon, Icon } = VARIANTS[variant]

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-control border p-3 text-sm text-ink ${box} ${className}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${icon}`} />
      <div className="flex flex-col gap-0.5">
        {title && <p className="font-medium">{typeof title === 'string' ? t(title) : title}</p>}
        {children && <div className="text-ink-muted">{typeof children === 'string' ? t(children) : children}</div>}
      </div>
    </div>
  )
}
