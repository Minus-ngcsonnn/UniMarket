import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ArrowRightIcon, CheckIcon, MailIcon, ShieldCheckIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import OtpInput from '../../components/ui/OtpInput'
import { buttonClasses } from '../../components/ui/buttonClasses'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import { PATHS } from '../../routes/paths'
import { authApi } from '../../services/auth/authApi'
import { describeApiError } from '../../utils/apiErrorMessage'
import { OTP_LENGTH, validateOtp } from '../../utils/authValidation'
import { isValidEmail } from '../../utils/validators'
import useTranslation from '../../i18n/useTranslation'

/** Backend limits (AUTH_API.md): one new code per 60 s, 5 per hour, each valid 10 minutes, 5 wrong tries. */
const RESEND_COOLDOWN_SECONDS = 60

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
 * Step 2 of registration: the 6-digit code e-mailed to the account (POST /api/auth/verify-email).
 * Reached after registering (email in ?email=, expiry in the navigation state) or from the login page when the
 * account is not verified yet. The code proves ownership of the email address only — not student status.
 * The code is never logged or stored; it is not returned by any API (in development it is written to the
 * backend log by the 'log' mail mode).
 */
export default function VerifyEmailPage() {
  const { t, lang } = useTranslation()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [emailError, setEmailError] = useState()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState()
  const [alert, setAlert] = useState(null)
  // Outcome of the e-mail sent at registration (POST /api/auth/register → emailDelivery); null when arriving otherwise.
  const delivery = location.state?.emailDelivery ?? null
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [verified, setVerified] = useState(false)
  const [expiresAt, setExpiresAt] = useState(() => Date.parse(location.state?.codeExpiresAt ?? '') || null)
  const [resendAvailableAt, setResendAvailableAt] = useState(() =>
    location.state?.codeSentAt ? location.state.codeSentAt + RESEND_COOLDOWN_SECONDS * 1000 : null,
  )
  const resendSeconds = useCountdown(resendAvailableAt)
  const expirySeconds = useCountdown(expiresAt)
  const hasExpired = expiresAt !== null && expirySeconds === 0

  const formatTime = (time) => new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(time)

  function checkEmail() {
    const message = isValidEmail(email) ? undefined : 'Enter a valid email address, e.g. you@example.com.'
    setEmailError(message)
    return !message
  }

  async function handleVerify(event) {
    event.preventDefault()
    if (isVerifying) return
    const otpError = validateOtp(code)
    if (!checkEmail() || otpError) {
      setCodeError(otpError)
      return
    }
    setIsVerifying(true)
    setAlert(null)
    try {
      await authApi.verifyEmail(email.trim(), code)
      setVerified(true)
    } catch (error) {
      if (error.code === 'INVALID_VERIFICATION_CODE') {
        setCodeError('The code is incorrect or has expired. Check the latest email or request a new code.')
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setCode('')
        setAlert({ variant: 'warning', title: 'Too many wrong codes', message: 'This code is now closed. Request a new code and use the newest email.' })
      } else if (error.code === 'VALIDATION_FAILED') {
        setCodeError(error.fieldErrorMap().code ?? error.message)
      } else {
        setAlert({ variant: 'danger', ...describeApiError(error) })
      }
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResend() {
    if (isResending || resendSeconds > 0 || !checkEmail()) return
    setIsResending(true)
    setAlert(null)
    try {
      const result = await authApi.resendVerification(email.trim())
      // Same answer whether or not a code was sent (emails cannot be probed); a new code replaces older ones.
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)
      setExpiresAt(null)
      setCode('')
      setCodeError(undefined)
      setAlert({ variant: 'info', title: 'Check your email', message: result?.message ?? 'If a new code was sent, use the newest email.' })
    } catch (error) {
      if (error.code === 'EMAIL_DELIVERY_FAILED') {
        // The provider refused or did not answer: nothing was sent. Retry after the cooldown.
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)
        setAlert({ variant: 'warning', title: 'The email couldn’t be sent', message: error.message })
      } else {
        setAlert({ variant: 'danger', ...describeApiError(error) })
      }
    } finally {
      setIsResending(false)
    }
  }

  if (!USES_BACKEND_AUTH) {
    return (
      <Alert variant="info" title={t('Email verification isn’t connected in demo mode')}>
        {t('Set VITE_AUTH_MODE=backend to verify real accounts.')}
      </Alert>
    )
  }

  if (verified) {
    return (
      <div className="flex flex-col gap-6">
        <title>{t('Email verified · UniMarket')}</title>
        <span className="flex size-12 items-center justify-center rounded-card bg-success-soft text-success">
          <CheckIcon className="size-6" />
        </span>
        <header>
          <h1 className="text-3xl tracking-tight text-ink">{t('Your email is verified')}</h1>
          <p className="mt-2 text-ink-muted">
            {t('You can now sign in. This confirms that you own this email address; it is not a student verification.')}
          </p>
        </header>
        <Link to={`${PATHS.login}?email=${encodeURIComponent(email.trim())}`} className={buttonClasses({ size: 'lg', fullWidth: true })}>
          <ArrowRightIcon className="size-4.5" />
          {t('Continue to sign in')}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <title>{t('Verify your email · UniMarket')}</title>

      <ol aria-label={t('Registration steps')} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <li className="flex items-center gap-2 text-ink-muted">
          <span className="flex size-5 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckIcon className="size-3" />
          </span>
          {t('Account details')}
        </li>
        <li aria-hidden="true" className="hidden h-px w-6 bg-line min-[420px]:block" />
        <li aria-current="step" className="flex items-center gap-2 font-medium text-primary">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">2</span>
          {t('Email verification')}
        </li>
      </ol>

      <header className="flex flex-col gap-3">
        <span className="flex size-12 items-center justify-center rounded-card bg-primary-soft text-primary">
          <ShieldCheckIcon className="size-6" />
        </span>
        <h1 className="text-3xl tracking-tight text-ink sm:text-[2.125rem]">{t('Verify your email')}</h1>
        <p className="text-ink-muted">
          {t('Enter the {count}-digit code we sent to your email. It confirms that you own the address.', { count: OTP_LENGTH })}
        </p>
      </header>

      {delivery === 'SENT' && !alert && (
        <Alert variant="success" title={t('Check your inbox')}>
          {t('We emailed a 6-digit code to {email}. It can take a minute — also check Spam or Promotions.', { email: email.trim() })}
        </Alert>
      )}
      {delivery === 'LOGGED' && !alert && (
        <Alert variant="info" title={t('Development mode: no email was sent')}>
          {t('The backend runs with MAIL_MODE=log, so the code is written to its log instead of an inbox.')}
        </Alert>
      )}
      {delivery === 'FAILED' && !alert && (
        <Alert variant="warning" title={t('Your account was created, but the email couldn’t be sent')}>
          {t('Wait for the countdown, then request a new code. You don’t need to register again.')}
        </Alert>
      )}

      <form noValidate onSubmit={handleVerify} className="flex flex-col gap-5">
        <Input
          label={t('Email address')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setEmailError(undefined)
          }}
          onBlur={() => email && checkEmail()}
          error={emailError}
          fieldSize="lg"
          startIcon={<MailIcon className="size-4.5" />}
        />

        <OtpInput
          label={t('Verification code')}
          value={code}
          onChange={(next) => {
            setCode(next)
            if (codeError && next.length === OTP_LENGTH) setCodeError(undefined)
          }}
          error={codeError}
          length={OTP_LENGTH}
        />

        <p className="text-sm text-ink-muted" aria-live="polite">
          {expiresAt && !hasExpired && t('The code is valid until {time}.', { time: formatTime(expiresAt) })}
          {hasExpired && t('This code has expired. Request a new one.')}
          {!expiresAt && t('Codes are valid for 10 minutes. Wrong codes are limited to 5 tries.')}
        </p>

        {alert && (
          <Alert variant={alert.variant} title={t(alert.title)}>
            {t(alert.message)}
          </Alert>
        )}

        <Button type="submit" size="lg" fullWidth loading={isVerifying}>
          <ArrowRightIcon className="size-4.5" />
          {t('Verify email')}
        </Button>

        <p className="text-sm text-ink-muted">
          {t('Didn’t get the code? Check your spam folder or')}{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || resendSeconds > 0}
            className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
          >
            {resendSeconds > 0 ? t('resend in {count} s', { count: resendSeconds }) : t('resend code')}
          </button>
          . {t('Up to 5 codes per hour.')}
        </p>

        <Link to={PATHS.register} className="text-center text-sm text-ink-muted transition-colors hover:text-ink">
          {t('Back to registration')}
        </Link>
      </form>
    </div>
  )
}
