import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeftIcon, ArrowRightIcon, LockIcon, MailIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import OtpInput from '../../components/ui/OtpInput'
import PasswordInput from '../../components/ui/PasswordInput'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { authApi } from '../../services/auth/authApi'
import { session } from '../../services/auth/session'
import { describeApiError } from '../../utils/apiErrorMessage'
import {
  EMAIL_MAX_LENGTH,
  OTP_LENGTH,
  PASSWORD_RULE_TEXT,
  validateForgotPassword,
  validateResetPassword,
} from '../../utils/authValidation'
import useTranslation from '../../i18n/useTranslation'

/** Backend limits (AUTH_API.md): one code per 60 s, 5 per hour, each valid 10 minutes, 5 wrong tries. */
const RESEND_COOLDOWN_SECONDS = 60
const PASSWORD_RULES_ID = 'reset-password-rules'

function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until || until <= Date.now()) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}

/**
 * "Forgot password" (POST /api/auth/forgot-password, then POST /api/auth/reset-password).
 * Step 1: the student enters the account email; the backend e-mails a 6-digit code (same answer whether or not the
 * email is registered, so this page never says whether an account exists).
 * Step 2: the code + a new password (same rules as registration). On success the student signs in with the new
 * password on the login page; any session stored in this browser is forgotten (the backend rejects tokens issued
 * before the reset). Codes are never logged or stored in the browser.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState('email') // 'email' → 'reset'
  const [alert, setAlert] = useState(null)
  const [resendAvailableAt, setResendAvailableAt] = useState(null)
  const [isResending, setIsResending] = useState(false)
  const resendSeconds = useCountdown(resendAvailableAt)

  const requestForm = useForm({
    initialValues: { email: searchParams.get('email') ?? '' },
    validate: validateForgotPassword,
    onSubmit: requestCode,
  })

  const resetForm = useForm({
    initialValues: { email: '', code: '', newPassword: '', confirmPassword: '' },
    validate: validateResetPassword,
    onSubmit: resetPassword,
  })

  /** Sends (or re-sends) a code. @returns true when the backend answered 202 */
  async function sendCode(email) {
    setAlert(null)
    try {
      const result = await authApi.forgotPassword(email)
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)
      setAlert({
        variant: 'info',
        title: 'Check your email',
        message: result?.message ?? 'If this email belongs to a UniMarket account, a password reset code has been sent.',
      })
      return true
    } catch (error) {
      if (error.code === 'EMAIL_DELIVERY_FAILED') {
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)
        setAlert({ variant: 'warning', title: 'The email couldn’t be sent', message: 'Please wait a minute and request a new code.' })
      } else if (error.code === 'VALIDATION_FAILED') {
        requestForm.setServerErrors(error.fieldErrorMap())
      } else {
        setAlert({ variant: 'danger', ...describeApiError(error) })
      }
      return false
    }
  }

  async function requestCode(values) {
    const email = values.email.trim()
    if (await sendCode(email)) {
      resetForm.setFieldValues({ email, code: '' })
      setStep('reset')
    }
  }

  async function resend() {
    if (isResending || resendSeconds > 0) return
    setIsResending(true)
    resetForm.setFieldValues({ code: '' })
    await sendCode(resetForm.values.email.trim())
    setIsResending(false)
  }

  async function resetPassword(values) {
    setAlert(null)
    const email = values.email.trim()
    try {
      await authApi.resetPassword(email, values.code, values.newPassword)
      // The reset ends every older session on the server (tokens are bound to the password): forget ours too.
      if (session.getSnapshot().status !== 'anonymous') session.signOut()
      navigate(`${PATHS.login}?email=${encodeURIComponent(email)}`, { replace: true, state: { passwordReset: true } })
    } catch (error) {
      if (error.code === 'INVALID_RESET_CODE') {
        resetForm.setServerErrors({ code: 'The code is incorrect or has expired. Check the latest email or request a new code.' })
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        resetForm.setFieldValues({ code: '' })
        setAlert({ variant: 'warning', title: 'Too many wrong codes', message: 'This code is now closed. Request a new code and use the newest email.' })
      } else if (error.code === 'VALIDATION_FAILED') {
        resetForm.setServerErrors(error.fieldErrorMap())
      } else {
        setAlert({ variant: 'danger', ...describeApiError(error) })
      }
    }
  }

  if (!USES_BACKEND_AUTH) {
    return (
      <Alert variant="info" title={t('Password reset isn’t connected in demo mode')}>
        {t('Set VITE_AUTH_MODE=backend to reset real passwords.')}
      </Alert>
    )
  }

  const alertBox = alert && (
    <Alert variant={alert.variant} title={t(alert.title)}>
      {t(alert.message)}
    </Alert>
  )

  return (
    <div className="flex flex-col gap-6">
      <title>{t('Forgot password · UniMarket')}</title>

      <header className="flex flex-col gap-3">
        <span className="flex size-12 items-center justify-center rounded-card bg-primary-soft text-primary">
          <LockIcon className="size-6" />
        </span>
        <h1 className="text-3xl tracking-tight text-ink sm:text-[2.125rem]">
          {step === 'email' ? t('Forgot your password?') : t('Set a new password')}
        </h1>
        <p className="text-ink-muted">
          {step === 'email'
            ? t('Enter the email address of your UniMarket account. We’ll email you a {count}-digit code to set a new password.', { count: OTP_LENGTH })
            : t('Enter the code we emailed to {email} and choose a new password.', { email: resetForm.values.email })}
        </p>
      </header>

      {step === 'email' ? (
        <form noValidate onSubmit={requestForm.handleSubmit} className="flex flex-col gap-5">
          <Input
            label={t('Email address')}
            type="email"
            autoComplete="email"
            placeholder={t('you@example.com')}
            maxLength={EMAIL_MAX_LENGTH}
            fieldSize="lg"
            startIcon={<MailIcon className="size-4.5" />}
            {...requestForm.getFieldProps('email')}
          />
          {alertBox}
          <Button type="submit" size="lg" fullWidth loading={requestForm.isSubmitting}>
            <ArrowRightIcon className="size-4.5" />
            {t('Send reset code')}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={resetForm.handleSubmit} className="flex flex-col gap-5">
          {alertBox}

          <OtpInput
            label={t('Reset code')}
            value={resetForm.values.code}
            onChange={(next) => resetForm.setFieldValue('code', next)}
            error={resetForm.getError('code')}
            length={OTP_LENGTH}
          />

          <PasswordInput
            label={t('New password')}
            autoComplete="new-password"
            placeholder={t('Create a new password')}
            fieldSize="lg"
            startIcon={<LockIcon className="size-4.5" />}
            aria-describedby={PASSWORD_RULES_ID}
            {...resetForm.getFieldProps('newPassword')}
          />
          <p id={PASSWORD_RULES_ID} className="-mt-3 text-xs text-ink-muted">
            {t(PASSWORD_RULE_TEXT)}
          </p>
          <PasswordInput
            label={t('Confirm new password')}
            autoComplete="new-password"
            placeholder={t('Repeat the new password')}
            fieldSize="lg"
            startIcon={<LockIcon className="size-4.5" />}
            {...resetForm.getFieldProps('confirmPassword')}
          />

          <p className="text-sm text-ink-muted">{t('Codes are valid for 10 minutes. Wrong codes are limited to 5 tries.')}</p>

          <Button type="submit" size="lg" fullWidth loading={resetForm.isSubmitting}>
            <ArrowRightIcon className="size-4.5" />
            {t('Change password')}
          </Button>

          <p className="text-sm text-ink-muted">
            {t('Didn’t get the code? Check your spam folder or')}{' '}
            <button
              type="button"
              onClick={resend}
              disabled={isResending || resendSeconds > 0}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
            >
              {resendSeconds > 0 ? t('resend in {count} s', { count: resendSeconds }) : t('resend code')}
            </button>
            . {t('Up to 5 codes per hour.')}
          </p>

          <button
            type="button"
            onClick={() => {
              setAlert(null)
              setStep('email')
            }}
            className="self-start text-sm font-medium text-primary hover:underline"
          >
            {t('Use a different email')}
          </button>
        </form>
      )}

      <Link to={PATHS.login} className="flex items-center justify-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink">
        <ArrowLeftIcon className="size-4" />
        {t('Back to sign in')}
      </Link>
    </div>
  )
}
