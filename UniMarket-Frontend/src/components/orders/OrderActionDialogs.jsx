import { ORDER_ACTIONS } from '../../utils/orderFlow'
import ReviewDialog from '../reviews/ReviewDialog'
import ConfirmDialog from '../ui/ConfirmDialog'
import PaymentDialog from './PaymentDialog'

/** Confirmation, payment and review dialogs for order actions (state from useOrderActions().dialogProps). */
export default function OrderActionDialogs({ dialog, isWorking, onRun, onClose }) {
  if (dialog?.type === 'review') return <ReviewDialog order={dialog.order} onClose={onClose} />
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
