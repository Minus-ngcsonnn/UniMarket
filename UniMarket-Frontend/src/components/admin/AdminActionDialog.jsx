import { useId, useState } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Textarea from '../ui/Textarea'

const TONES = {
  danger: { Icon: AlertTriangleIcon, iconBox: 'bg-danger-soft text-danger', button: 'danger' },
  primary: { Icon: CheckCircleIcon, iconBox: 'bg-primary-soft text-primary', button: 'primary' },
}
const MIN_REASON = 10
const MAX_REASON = 300

/**
 * Confirmation for an admin action (approve, block, suspend, resolve…), with an optional reason that
 * the student will see. Shows the result in the dialog; when the service answers saved=false it says
 * clearly that it was a preview and nothing changed.
 *
 * @param {{ label: string, placeholder?: string, hint?: string }} [reason] asks for a reason when set
 * @param {(reason: string) => Promise<{ saved: boolean }>} onConfirm
 * @param {string} doneText message when the action was really applied
 */
export default function AdminActionDialog({ title, message, confirmLabel, tone = 'primary', reason, onConfirm, onClose, doneText }) {
  const titleId = useId()
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [result, setResult] = useState(null) // { saved } | { error }
  const { Icon, iconBox, button } = TONES[tone]
  const isDone = Boolean(result && !result.error)

  const reasonError = reason && text.trim().length < MIN_REASON ? `Write at least ${MIN_REASON} characters.` : undefined

  async function confirm(event) {
    event.preventDefault()
    setTouched(true)
    if (reasonError) return
    setIsWorking(true)
    try {
      setResult(await onConfirm(text.trim()))
    } catch (actionError) {
      setResult({ error: actionError.message })
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <form noValidate onSubmit={confirm} className="flex flex-col gap-5 p-6">
        <div className="flex gap-4">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconBox}`}>
            <Icon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            <div className="text-sm text-ink-muted">{message}</div>
          </div>
        </div>

        {reason && !isDone && (
          <Textarea
            label={reason.label}
            rows={3}
            maxLength={MAX_REASON}
            placeholder={reason.placeholder}
            hint={reason.hint}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => setTouched(true)}
            error={touched ? reasonError : undefined}
          />
        )}

        <div aria-live="polite" className="empty:hidden">
          {result?.error && <Alert variant="danger" title="Not done">{result.error}</Alert>}
          {result && !result.error && (
            <Alert variant={result.saved ? 'success' : 'warning'} title={result.saved ? 'Done' : 'Preview only: nothing was changed'}>
              {result.saved ? doneText : 'The action passed all checks, but admin actions need the UniMarket backend, which isn’t connected yet.'}
            </Alert>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {isDone ? 'Close' : 'Cancel'}
          </Button>
          {!isDone && (
            <Button type="submit" variant={button} loading={isWorking}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
