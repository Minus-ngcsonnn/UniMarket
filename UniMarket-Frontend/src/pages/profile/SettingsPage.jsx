import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { GlobeIcon, LockIcon, LogOutIcon, UserIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import VerificationBadge from '../../components/profile/VerificationBadge'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import useAsyncData from '../../hooks/useAsyncData'
import useViewer from '../../hooks/useViewer'
import { LANGUAGES } from '../../i18n/languageContext'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { accountService } from '../../services/account/accountService'
import { orderService } from '../../services/orders/orderService'
import { isSampleData } from '../../services/products/productService'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'

function Section({ id, title, description, Icon, children }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h2 id={id} className="font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Account settings (Stage 4). Only settings the frontend can honour today are offered: interface
 * language (saved in this browser), account details with links to edit them, and demo-data tools.
 * Password changes and sign-out need authentication, which isn't connected yet; they say so.
 */
export default function SettingsPage() {
  const { t, lang, setLang } = useTranslation()
  const viewer = useViewer()
  const navigate = useNavigate()
  // Backend mode: the signed-in account from GET /api/auth/me (no demo profile).
  const { data: demoProfile } = useAsyncData(
    () => (USES_BACKEND_AUTH ? Promise.resolve(null) : accountService.getMyProfile()),
    'settings-profile',
  )
  const profile = USES_BACKEND_AUTH ? viewer.profile : demoProfile
  const [notice, setNotice] = useState(null)
  const [isResetOpen, setIsResetOpen] = useState(false)

  async function resetSampleData() {
    await orderService.resetSampleData()
    window.location.reload()
  }

  return (
    <PageContainer width="md" className="py-6 sm:py-8">
      <title>{t('Settings · UniMarket')}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My profile', to: PATHS.profile }, { label: 'Settings' }]} />
      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t('Settings')}</h1>
        <p className="mt-1.5 text-ink-muted">{t('Preferences for this browser and your account.')}</p>
      </header>

      <div className="flex flex-col gap-5">
        <Section id="language-title" title={t('Language')} description={t('Interface language. Listings and reviews stay in the language they were written in.')} Icon={GlobeIcon}>
          <div role="radiogroup" aria-labelledby="language-title" className="grid gap-2 sm:grid-cols-2">
            {LANGUAGES.map((language) => (
              <label
                key={language.code}
                className="flex cursor-pointer items-center gap-3 rounded-control border border-line px-4 py-3 text-sm transition-colors has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-2 has-focus-visible:ring-primary/30"
              >
                <input type="radio" name="language" value={language.code} checked={lang === language.code} onChange={() => setLang(language.code)} className="size-4 accent-primary" />
                <span lang={language.code} className="font-medium text-ink">
                  {language.label}
                </span>
                <span className="ml-auto text-xs text-ink-muted">{language.short}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section id="account-title" title={t('Account')} description={t('Your name, programme and campus are on your profile.')} Icon={UserIcon}>
          {profile ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-muted">{t('Name')}</dt>
                <dd className="mt-0.5 font-medium text-ink">{profile.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t('Email')}</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium break-all text-ink">
                  {profile.email}
                  <VerificationBadge user={profile} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">{viewer.isGuest ? t('Sign in to see your account details.') : t('Loading…')}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={PATHS.profile} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              {t('Edit profile')}
            </Link>
          </div>
        </Section>

        <Section id="security-title" title={t('Password & sign-in')} Icon={LockIcon}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNotice('password')}>
              {t('Change password')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => {
                if (USES_BACKEND_AUTH) {
                  viewer.signOut()
                  navigate(PATHS.home, { replace: true })
                  return
                }
                if (isSampleData) viewer.setGuestPreview(true)
                setNotice('signOut')
              }}
            >
              <LogOutIcon className="size-4" />
              {isSampleData && !USES_BACKEND_AUTH ? t('account.signOutDemo') : t('account.signOut')}
            </Button>
          </div>
          <div aria-live="polite" className="empty:hidden">
            {notice === 'password' && (
              <Alert variant="info" title="Password changes aren’t available yet" className="mt-4">
                {t('They will work once sign-in is connected to the UniMarket backend.')}
              </Alert>
            )}
            {notice === 'signOut' && (
              <Alert variant="info" title="Header shows the guest view" className="mt-4">
                {t('Sign-in isn’t connected yet, so this only changes what the header shows. Use the developer badge to switch back.')}
              </Alert>
            )}
          </div>
        </Section>

        {isSampleData && (
          <Section id="data-title" title={t('Demo data in this browser')} description={t('Sample orders, reviews, your cart and saved items are kept in this browser only.')} Icon={GlobeIcon}>
            <Button variant="secondary" size="sm" onClick={() => setIsResetOpen(true)}>
              {t('Reset sample data')}
            </Button>
          </Section>
        )}
      </div>

      {isResetOpen && (
        <ConfirmDialog
          title="Reset sample data?"
          message="All sample orders you placed or changed are removed, and listings go back to their original status. Your cart is kept."
          confirmLabel="Reset sample data"
          onConfirm={resetSampleData}
          onClose={() => setIsResetOpen(false)}
        />
      )}
    </PageContainer>
  )
}
