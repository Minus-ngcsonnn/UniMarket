import { useState } from 'react'
import { Link } from 'react-router'
import AuthTabs from '../../components/auth/AuthTabs'
import VerifyEmailDialog from '../../components/auth/VerifyEmailDialog'
import { ArrowRightIcon, CheckCircleIcon, LockIcon, MailIcon, UserIcon } from '../../components/icons'
import Button from '../../components/ui/Button'
import Checkbox from '../../components/ui/Checkbox'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { PASSWORD_RULE_TEXT, validateRegister } from '../../utils/authValidation'
import useTranslation from '../../i18n/useTranslation'

const PASSWORD_RULES_ID = 'register-password-rules'

/**
 * Register screen (Figma). Validates input on the client only.
 * Registration policy (team decision, Nov 2026): students from any university or college in Vietnam register with
 * ANY valid email address (Gmail, Outlook, Yahoo, a university address…). The 6-digit code (OTP) proves that the
 * person owns the email address; it does not prove enrolment, so no "verified student" status is shown.
 * A valid submit opens the email-verification step (OTP) in preview mode: the backend is not connected,
 * so no account is created and no code is sent.
 */
export default function RegisterPage() {
  const { t } = useTranslation()
  const [verification, setVerification] = useState(null) // { email, attempt } while the OTP dialog is open

  const form = useForm({
    initialValues: { fullName: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
    validate: validateRegister,
    onSubmit: (values) => setVerification((current) => ({ email: values.email.trim(), attempt: (current?.attempt ?? 0) + 1 })),
  })

  const passwordIcon = <LockIcon className="size-4.5" />

  return (
    <div className="flex flex-col gap-6">
      <title>{t("Register · UniMarket")}</title>

      <header>
        <h1 className="text-3xl tracking-tight text-ink sm:text-[2.125rem]">{t("Your campus. Your community.")}</h1>
        <p className="mt-2 text-ink-muted">{t("Join UniMarket. Great finds start here.")}</p>
      </header>

      <AuthTabs />

      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <Input
          label={t("Full name")}
          autoComplete="name"
          placeholder={t("Your full name")}
          fieldSize="lg"
          startIcon={<UserIcon className="size-4.5" />}
          {...form.getFieldProps('fullName')}
        />

        <Input
          label={t("Email address")}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
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
