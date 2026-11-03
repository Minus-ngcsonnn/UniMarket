import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import AuthTabs from '../../components/auth/AuthTabs'
import PendingNotice from '../../components/auth/PendingNotice'
import { ArrowRightIcon, LockIcon, MailIcon, ShieldCheckIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Checkbox from '../../components/ui/Checkbox'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import TextDivider from '../../components/ui/TextDivider'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import useForm from '../../hooks/useForm'
import useSession from '../../hooks/useSession'
import { PATHS, landingPath, safeNextPath } from '../../routes/paths'
import { session } from '../../services/auth/session'
import { describeApiError } from '../../utils/apiErrorMessage'
import { validateLogin } from '../../utils/authValidation'
import useTranslation from '../../i18n/useTranslation'

/**
 * Login screen (Figma).
 * - VITE_AUTH_MODE=backend: POST /api/auth/login, then GET /api/auth/me (the role and profile come from the server).
 *   "Remember me" keeps the session after the browser closes (localStorage), otherwise for this tab only.
 * - demo mode: validation only; a valid submit shows a notice and sends nothing.
 */
export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const auth = useSession()
  const [notice, setNotice] = useState(null)
  const [failure, setFailure] = useState(null) // { variant, title, message, verifyEmail? }
  const next = searchParams.get('next')
  // Set by the forgot-password page after a successful reset.
  const passwordReset = location.state?.passwordReset === true

  const form = useForm({
    initialValues: { email: searchParams.get('email') ?? '', password: '', rememberMe: false },
    validate: validateLogin,
    onSubmit: USES_BACKEND_AUTH ? signIn : () => setNotice('signIn'),
  })

  async function signIn(values) {
    setFailure(null)
    const email = values.email.trim()
    try {
      const user = await session.signIn(email, values.password, values.rememberMe)
      navigate(landingPath(user, next), { replace: true })
    } catch (error) {
      if (error.code === 'INVALID_CREDENTIALS') {
        setFailure({ variant: 'danger', title: 'Sign-in failed', message: 'The email or password is incorrect.' })
      } else if (error.code === 'EMAIL_NOT_VERIFIED') {
        setFailure({ variant: 'warning', title: 'Verify your email first', message: 'Enter the code we emailed you, or request a new one.', verifyEmail: email })
      } else if (error.code === 'ACCOUNT_DISABLED') {
        setFailure({ variant: 'danger', title: 'This account can’t be used', message: error.message })
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setFailure({ variant: 'warning', title: 'Too many attempts', message: 'Too many failed sign-ins for this email. Wait 15 minutes and try again.' })
      } else if (error.code === 'VALIDATION_FAILED') {
        form.setServerErrors(error.fieldErrorMap())
      } else {
        setFailure({ variant: 'danger', ...describeApiError(error) })
      }
    }
  }

  // Already signed in (e.g. the user opened /login in another tab): go on.
  if (USES_BACKEND_AUTH && auth.status === 'authenticated' && !form.isSubmitting) {
    return <Navigate to={landingPath(auth.user, next)} replace />
  }

  return (
    <div className="flex flex-col gap-8">
      <title>{t("Login · UniMarket")}</title>

      <header>
        <h1 className="text-3xl tracking-tight text-ink sm:text-[2.125rem]">{t("Good to see you again.")}</h1>
        <p className="mt-2 text-ink-muted">{t("Your next great find is right around campus.")}</p>
      </header>

      <AuthTabs />

      {USES_BACKEND_AUTH && passwordReset && !failure && (
        <Alert variant="success" title={t('Your password has been changed')}>
          {t('Sign in with your new password.')}
        </Alert>
      )}
      {USES_BACKEND_AUTH && auth.reason === 'expired' && !failure && (
        <Alert variant="info" title={t('Your session has ended')}>
          {t('Please sign in again.')}
        </Alert>
      )}
      {USES_BACKEND_AUTH && safeNextPath(next) && auth.reason !== 'expired' && !failure && (
        <Alert variant="info" title={t('Sign in to continue')}>
          {t('This page needs a UniMarket account.')}
        </Alert>
      )}

      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <Input
          label={t("Email address")}
          type="email"
          autoComplete="email"
          placeholder={t("you@example.com")}
          fieldSize="lg"
          startIcon={<MailIcon className="size-4.5" />}
          {...form.getFieldProps('email')}
        />
        <PasswordInput
          label={t("Password")}
          autoComplete="current-password"
          placeholder={t("Enter your password")}
          fieldSize="lg"
          startIcon={<LockIcon className="size-4.5" />}
          {...form.getFieldProps('password')}
        />

        <div className="flex items-center justify-between gap-4">
          <Checkbox label={t("Remember me")} {...form.getCheckboxProps('rememberMe')} />
          {USES_BACKEND_AUTH ? (
            <Link
              to={form.values.email.trim() ? `${PATHS.forgotPassword}?email=${encodeURIComponent(form.values.email.trim())}` : PATHS.forgotPassword}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('Forgot password?')}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setNotice('forgotPassword')}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('Forgot password?')}
            </button>
          )}
        </div>

        {failure && (
          <Alert variant={failure.variant} title={t(failure.title)}>
            {t(failure.message)}
            {failure.verifyEmail && (
              <>
                {' '}
                <Link
                  to={`${PATHS.verifyEmail}?email=${encodeURIComponent(failure.verifyEmail)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {t('Verify my email')}
                </Link>
              </>
            )}
          </Alert>
        )}

        <Button type="submit" size="lg" fullWidth loading={form.isSubmitting}>
          <ArrowRightIcon className="size-4.5" />
          {t("Login")}
        </Button>

        <PendingNotice type={notice} />
      </form>

      <div className="flex flex-col gap-4">
        <TextDivider>{t("New to the campus community?")}</TextDivider>
        <p className="text-center text-sm text-balance text-ink-muted">
          <Link to={PATHS.register} className="font-medium text-ink hover:text-primary hover:underline">
            {t("Create a UniMarket account with any email address.")}
          </Link>
        </p>
        <p className="flex items-center justify-center gap-2 text-xs text-ink-muted">
          <ShieldCheckIcon className="size-4" />
          {t('A safer marketplace starts with students like you.')}
        </p>
      </div>
    </div>
  )
}
