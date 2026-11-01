import { ORDER_ACTIONS } from '../../utils/orderFlow'
import ConfirmDialog from '../ui/ConfirmDialog'
import PaymentDialog from './PaymentDialog'

/** Confirmation and payment dialogs for order actions (state from useOrderActions().dialogProps). */
export default function OrderActionDialogs({ dialog, isWorking, onRun, onClose }) {
  if (dialog?.type === 'pay') return <PaymentDialog order={dialog.order} onClose={onClose} onPaid={() => {}} />
  if (dialog?.type === 'confirm') {
    return (
      <ConfirmDialog
        {...ORDER_ACTIONS[dialog.action].confirm}
        isWorking={isWorking}
        onConfirm={() => onRun(dialog.order, dialog.action)}
        onClose={onClose}
      />
    )
  }
  return null
}
