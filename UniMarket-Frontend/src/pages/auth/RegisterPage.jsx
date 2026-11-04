import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import AffiliationFields from '../../components/auth/AffiliationFields'
import AuthTabs from '../../components/auth/AuthTabs'
import VerifyEmailDialog from '../../components/auth/VerifyEmailDialog'
import { ArrowRightIcon, CheckCircleIcon, LockIcon, MailIcon, UserIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Checkbox from '../../components/ui/Checkbox'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import useAsyncData from '../../hooks/useAsyncData'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { authApi, referenceApi } from '../../services/auth/authApi'
import { describeApiError } from '../../utils/apiErrorMessage'
import {
  AFFILIATION,
  EMAIL_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  PASSWORD_RULE_TEXT,
  REGISTER_FIELD_MAP,
  toRegisterRequest,
  validateRegister,
} from '../../utils/authValidation'
import useTranslation from '../../i18n/useTranslation'

const PASSWORD_RULES_ID = 'register-password-rules'
const SERVER_FIELD_ERRORS = {
  EMAIL_ALREADY_REGISTERED: 'email',
  INVALID_CAMPUS: 'campusId',
}

const noData = () => Promise.resolve(null)

/**
 * Register screen (Figma).
 * Registration policy (team decision, Nov 2026, V003): students from any university or college in Vietnam register
 * with ANY valid email address and choose EXACTLY ONE affiliation — an official campus or a self-declared school name.
 * The 6-digit code (OTP) proves that the person owns the email address; it does not prove enrolment, so no
 * "verified student" status is shown.
 *
 * - VITE_AUTH_MODE=backend: POST /api/auth/register, then the email-verification page (/verify-email).
 * - demo mode: validation only; the verification dialog opens in preview mode (nothing is sent).
 */
export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [verification, setVerification] = useState(null) // demo only: { email, attempt } while the OTP dialog is open
  const [formError, setFormError] = useState(null)

  const campuses = useAsyncData(USES_BACKEND_AUTH ? referenceApi.campuses : noData, 'register-campuses')

  const form = useForm({
    initialValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      affiliationType: '',
      campusId: '',
      directoryId: '',
      universityName: '',
      acceptTerms: false,
    },
    validate: (values) => validateRegister(values, { requireAffiliation: USES_BACKEND_AUTH }),
    onSubmit: USES_BACKEND_AUTH ? register : previewVerification,
  })

  function previewVerification(values) {
    setVerification((current) => ({ email: values.email.trim(), attempt: (current?.attempt ?? 0) + 1 }))
  }

  async function register(values) {
    setFormError(null)
    try {
      const result = await authApi.register(toRegisterRequest(values))
      const email = result.user?.email ?? values.email.trim()
      navigate(`${PATHS.verifyEmail}?email=${encodeURIComponent(email)}`, {
        state: { codeExpiresAt: result.codeExpiresAt, codeSentAt: Date.now(), emailDelivery: result.emailDelivery },
      })
    } catch (error) {
      const fieldErrors = {}
      Object.entries(error.fieldErrorMap?.() ?? {}).forEach(([field, message]) => {
        const formField = REGISTER_FIELD_MAP[field]
        if (formField) fieldErrors[formField] = message
      })
      const field = SERVER_FIELD_ERRORS[error.code]
      if (field) fieldErrors[field] = error.message
      // A directory choice has no text field: show name errors under the university picker.
      if (values.affiliationType === AFFILIATION.DIRECTORY && fieldErrors.universityName) {
        fieldErrors.affiliationType = fieldErrors.universityName
        delete fieldErrors.universityName
      }
      if (Object.keys(fieldErrors).length > 0) {
        form.setServerErrors(fieldErrors)
        if (error.code === 'EMAIL_ALREADY_REGISTERED') setFormError({ kind: 'duplicate', ...describeApiError(error) })
        else if (error.code !== 'VALIDATION_FAILED' && !field) setFormError(describeApiError(error))
      } else {
        setFormError(describeApiError(error))
      }
    }
  }

  const passwordIcon = <LockIcon className="size-4.5" />

  return (
    <div className="flex flex-col gap-6">
      <title>{t("Register · UniMarket")}</title>

      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-[2.25rem]">{t("Your campus. Your community.")}</h1>
        <p className="mt-2 text-ink-muted">{t("Join UniMarket. Great finds start here.")}</p>
      </header>

      <AuthTabs />

      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <Input
          label={t("Full name")}
          autoComplete="name"
          placeholder={t("Your full name")}
          maxLength={FULL_NAME_MAX_LENGTH + 20}
          fieldSize="lg"
          startIcon={<UserIcon className="size-4.5" />}
          {...form.getFieldProps('fullName')}
        />

        <Input
          label={t("Email address")}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={EMAIL_MAX_LENGTH}
          hint={t("Any email address works, for example Gmail, Outlook or your university email.")}
          fieldSize="lg"
          startIcon={<MailIcon className="size-4.5" />}
          {...form.getFieldProps('email')}
        />

        <div className="flex flex-col gap-2">
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
            <PasswordInput
              label={t("Password")}
              autoComplete="new-password"
              placeholder={t("Create password")}
              fieldSize="lg"
              startIcon={passwordIcon}
              aria-describedby={PASSWORD_RULES_ID}
              {...form.getFieldProps('password')}
            />
            <PasswordInput
              label={t("Confirm password")}
              autoComplete="new-password"
              placeholder={t("Repeat password")}
              fieldSize="lg"
              startIcon={passwordIcon}
              {...form.getFieldProps('confirmPassword')}
            />
          </div>
          <p id={PASSWORD_RULES_ID} className="text-xs text-ink-muted">
            {t(PASSWORD_RULE_TEXT)}
          </p>
        </div>

        {USES_BACKEND_AUTH && <AffiliationFields form={form} campuses={campuses} />}

        <Checkbox
          label={
            <>
              {t('I agree to the')}{' '}
              <Link to={PATHS.terms} className="text-primary hover:underline">
                {t("Terms of service")}
              </Link>{' '}
              {t('and')}{' '}
              <Link to={PATHS.privacy} className="text-primary hover:underline">
                {t("Privacy policy")}
              </Link>
              .
            </>
          }
          {...form.getCheckboxProps('acceptTerms')}
        />

        {formError && (
          <Alert variant={formError.kind === 'duplicate' ? 'warning' : 'danger'} title={t(formError.title)}>
            {t(formError.message)}
            {formError.kind === 'duplicate' && (
              <>
                {' '}
                <Link to={`${PATHS.login}?email=${encodeURIComponent(form.values.email.trim())}`} className="font-medium text-primary hover:underline">
                  {t('Sign in instead')}
                </Link>
                {' · '}
                <Link
                  to={`${PATHS.verifyEmail}?email=${encodeURIComponent(form.values.email.trim())}`}
                  className="font-medium text-primary hover:underline"
                >
                  {t('Not verified yet? Get a new code')}
                </Link>
              </>
            )}
          </Alert>
        )}

        <Button type="submit" size="lg" fullWidth loading={form.isSubmitting}>
          <ArrowRightIcon className="size-4.5" />
          {t("Create account")}
        </Button>

        <p className="flex items-start justify-center gap-2 text-center text-xs text-ink-muted">
          <CheckCircleIcon className="size-4 shrink-0 text-primary" />
          {t("Next: enter the 6-digit code we email you to verify your account.")}
        </p>
      </form>

      {verification && (
        <VerifyEmailDialog key={verification.attempt} email={verification.email} onClose={() => setVerification(null)} />
      )}
    </div>
  )
}
