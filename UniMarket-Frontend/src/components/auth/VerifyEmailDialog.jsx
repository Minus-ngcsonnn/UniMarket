import { useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, CheckIcon, ShieldCheckIcon, XIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import OtpInput from '../ui/OtpInput'
import PendingNotice from './PendingNotice'

const CODE_LENGTH = 6

/**
 * Step 2 of registration: enter the 6-digit code e-mailed to the student (decision Q1: OTP).
 * Visual structure follows the Figma "Student ID Verification" modal (stepper, icon, title, primary action,
 * "Back to registration"), with the upload area replaced by the code input.
 *
 * Backend is not connected yet: no code is sent, and "Verify" only validates the format and shows a notice.
 * Mount this component to open it; it closes via the X button, "Back to registration" or Esc.
 */
export default function VerifyEmailDialog({ email, onClose }) {
  const dialogRef = useRef(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState()
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first focusable element (the close button); start on the code instead.
      dialog.querySelector('input')?.focus()
    }
  }, [])

  function close() {
    dialogRef.current?.close()
  }

  function handleCodeChange(nextCode) {
    setCode(nextCode)
    if (error && nextCode.length === CODE_LENGTH) setError(undefined)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      setError(`Enter the ${CODE_LENGTH}-digit code from your email.`)
      setNotice(null)
      return
    }
    setError(undefined)
    setNotice('verifyCode')
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="verify-email-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/50"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <ol aria-label="Registration steps" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <li className="flex items-center gap-2 text-ink-muted">
              <span className="flex size-5 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckIcon className="size-3" />
              </span>
              Account details
            </li>
            <li aria-hidden="true" className="hidden h-px w-6 bg-line min-[420px]:block" />
            <li aria-current="step" className="flex items-center gap-2 font-medium text-primary">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">2</span>
              Email verification
            </li>
          </ol>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <span className="flex size-12 items-center justify-center rounded-card bg-primary-soft text-primary">
            <ShieldCheckIcon className="size-6" />
          </span>
          <h2 id="verify-email-title" className="text-2xl tracking-tight sm:text-3xl">
            Verify your email
          </h2>
          <p className="text-ink-muted">
            A little proof. A more trusted campus. Enter the {CODE_LENGTH}-digit code we sent to{' '}
            <span className="font-medium [overflow-wrap:anywhere] text-ink">{email}</span>.
          </p>
        </div>

        <Alert variant="warning" title="Preview only">
          Account creation isn’t connected yet, so no code was sent.
        </Alert>

        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
          <OtpInput label="Verification code" value={code} onChange={handleCodeChange} error={error} length={CODE_LENGTH} />

          <p className="text-sm text-ink-muted">
            Didn’t get the code? Check your spam folder or{' '}
            <button type="button" onClick={() => setNotice('resendCode')} className="font-medium text-primary hover:underline">
              resend code
            </button>
            .
          </p>

          <Button type="submit" size="lg" fullWidth>
            <ArrowRightIcon className="size-4.5" />
            Verify email
          </Button>

          <PendingNotice type={notice} />

          <button type="button" onClick={close} className="text-sm text-ink-muted transition-colors hover:text-ink">
            Back to registration
          </button>
        </form>
      </div>
    </dialog>
  )
}
