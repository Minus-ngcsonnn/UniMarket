import { useState } from 'react'
import { Link } from 'react-router'
import AuthTabs from '../../components/auth/AuthTabs'
import PendingNotice from '../../components/auth/PendingNotice'
import { ArrowRightIcon, LockIcon, MailIcon, ShieldCheckIcon } from '../../components/icons'
import Button from '../../components/ui/Button'
import Checkbox from '../../components/ui/Checkbox'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import TextDivider from '../../components/ui/TextDivider'
import useForm from '../../hooks/useForm'
import { PATHS } from '../../routes/paths'
import { validateLogin } from '../../utils/authValidation'
import useTranslation from '../../i18n/useTranslation'

/**
 * Login screen (Figma). Validates input on the client only.
 * Backend authentication is pending: a valid submit shows a notice and sends nothing.
 */
export default function LoginPage() {
  const { t } = useTranslation()
  const [notice, setNotice] = useState(null)
  const form = useForm({
    initialValues: { email: '', password: '', rememberMe: false },
    validate: validateLogin,
    onSubmit: () => setNotice('signIn'),
  })

  return (
    <div className="flex flex-col gap-8">
      <title>{t("Login · UniMarket")}</title>

      <header>
        <h1 className="text-3xl tracking-tight text-ink sm:text-[2.125rem]">{t("Good to see you again.")}</h1>
        <p className="mt-2 text-ink-muted">{t("Your next great find is right around campus.")}</p>
      </header>

      <AuthTabs />

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
          <button
            type="button"
            onClick={() => setNotice('forgotPassword')}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("Forgot password?")}
          </button>
        </div>

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
          <ShieldCheckIcon className="size-4" />A safer marketplace starts with students like you.
        </p>
      </div>
    </div>
  )
}
