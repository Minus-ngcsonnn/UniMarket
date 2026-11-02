import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import AuthTabs from '../../components/auth/AuthTabs'
import UniversityEmailButton from '../../components/auth/UniversityEmailButton'
import VerifyEmailDialog from '../../components/auth/VerifyEmailDialog'
import { ArrowRightIcon, CheckCircleIcon, GraduationCapIcon, LockIcon, MailIcon, UserIcon } from '../../components/icons'
import Button from '../../components/ui/Button'
import Checkbox from '../../components/ui/Checkbox'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import TextDivider from '../../components/ui/TextDivider'
import { STUDENT_EMAIL_DOMAINS, STUDENT_EMAIL_PLACEHOLDER } from '../../constants/studentEmail'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { PASSWORD_RULE_TEXT, validateRegister } from '../../utils/authValidation'
import useTranslation from '../../i18n/useTranslation'

const EMAIL_FIELD_ID = 'register-email'
const PASSWORD_RULES_ID = 'register-password-rules'

/** Email field settings for the two registration modes (decision Q1: any email or university email + OTP). */
const EMAIL_MODES = {
  personal: { label: 'Email address', placeholder: 'you@example.com', Icon: MailIcon, hint: undefined },
  university: {
    label: 'University email',
    placeholder: STUDENT_EMAIL_PLACEHOLDER,
    Icon: GraduationCapIcon,
    hint: `Only @${STUDENT_EMAIL_DOMAINS.join(', @')} addresses.`,
  },
}

/** Validation for the given email mode. */
function validatorFor(mode) {
  return (values) => validateRegister(values, { requireStudentEmail: mode === 'university' })
}

/**
 * Register screen (Figma). Validates input on the client only.
 * A valid submit opens the email-verification step (OTP) in preview mode: the backend is not connected,
 * so no account is created and no code is sent.
 * ?method=university opens the page in university-email mode (used by the Login page button).
 */
export default function RegisterPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [emailMode, setEmailMode] = useState(searchParams.get('method') === 'university' ? 'university' : 'personal')
  const [verification, setVerification] = useState(null) // { email, attempt } while the OTP dialog is open

  const form = useForm({
    initialValues: { fullName: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
    validate: validatorFor(emailMode),
    onSubmit: (values) => setVerification((current) => ({ email: values.email.trim(), attempt: (current?.attempt ?? 0) + 1 })),
  })

  const emailField = EMAIL_MODES[emailMode]
  const EmailIcon = emailField.Icon
  const passwordIcon = <LockIcon className="size-4.5" />

  function chooseEmailMode(mode) {
    setEmailMode(mode)
    form.revalidate(validatorFor(mode)) // an already-entered email is re-checked against the new rule
    document.getElementById(EMAIL_FIELD_ID)?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <title>{t("Register · UniMarket")}</title>

      <header>
        <h1 className="text-3xl tracking-tight text-ink sm:text-[2.125rem]">{t("Your campus. Your community.")}</h1>
        <p className="mt-2 text-ink-muted">{t("Join UniMarket. Great finds start here.")}</p>
      </header>

      <AuthTabs />

      <div className="flex flex-col gap-3">
        <UniversityEmailButton pressed={emailMode === 'university'} onClick={() => chooseEmailMode('university')} />
        <p className="text-center text-xs text-ink-muted">{t("Use your university email for easy student verification.")}</p>
      </div>

      <TextDivider>{t("or register with your email")}</TextDivider>

      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <Input
          label={t("Full name")}
          autoComplete="name"
          placeholder={t("Your full name")}
          fieldSize="lg"
          startIcon={<UserIcon className="size-4.5" />}
          {...form.getFieldProps('fullName')}
        />

        <div className="flex flex-col gap-1.5">
          <Input
            id={EMAIL_FIELD_ID}
            label={emailField.label}
            type="email"
            autoComplete="email"
            placeholder={emailField.placeholder}
            hint={emailField.hint}
            fieldSize="lg"
            startIcon={<EmailIcon className="size-4.5" />}
            {...form.getFieldProps('email')}
          />
          {emailMode === 'university' && (
            <button
              type="button"
              onClick={() => chooseEmailMode('personal')}
              className="w-fit text-xs font-medium text-primary hover:underline"
            >
              {t("Use a personal email instead")}
            </button>
          )}
        </div>

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
