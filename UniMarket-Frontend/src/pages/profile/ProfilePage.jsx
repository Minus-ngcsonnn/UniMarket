import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRightIcon, BadgeCheckIcon, HeartIcon, MailIcon, PackageIcon, PencilIcon, PlusIcon, SettingsIcon, ShoppingCartIcon, StoreIcon, TagIcon, UserIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import ProfileCard from '../../components/profile/ProfileCard'
import ProfileForm from '../../components/profile/ProfileForm'
import ReviewList from '../../components/reviews/ReviewList'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import useAsyncData from '../../hooks/useAsyncData'
import useOrderAttention from '../../hooks/useOrderAttention'
import { PATHS } from '../../routes/paths'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import { accountService } from '../../services/account/accountService'
import { referenceApi } from '../../services/auth/authApi'
import { session } from '../../services/auth/session'
import { toViewerProfile } from '../../services/auth/viewerProfile'
import useTranslation from '../../i18n/useTranslation'

function Section({ title, description, action, children, id }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-lg font-bold text-ink">
            {t(title)}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{t(description)}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Email verification: the one-time code proves ownership of the email address (any domain), not student enrolment. */
function VerificationStatus({ profile }) {
  const { t } = useTranslation()
  const states = profile.emailVerified
    ? { tone: 'bg-primary-soft text-primary', Icon: BadgeCheckIcon, title: 'Email verified', text: 'Your email address is verified with a one-time code. Other students see the Email verified badge on your profile and listings.' }
    : { tone: 'bg-warning-soft text-warning', Icon: MailIcon, title: 'Email not verified', text: 'Verify your email with the one-time code we sent you before buying or selling.' }

  return (
    <div className="flex gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${states.tone}`}>
        <states.Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{t(states.title)}</p>
        <p className="truncate text-sm text-ink">{profile.email}</p>
        <p className="mt-1 text-sm text-ink-muted">{t(states.text)}</p>
      </div>
    </div>
  )
}

const withCount = (t, label, count) => (count > 0 ? `${t(label)} · ${t('{count} to do', { count })}` : label)

/**
 * Backend mode: the account from GET /api/auth/me (re-read from the server on every visit) plus, for students,
 * rating and active listings from the public profile GET /api/users/{id}. Nothing is taken from local storage.
 */
async function loadBackendProfile() {
  const user = await session.refresh()
  let publicProfile = null
  if (user?.role === 'STUDENT') {
    try {
      publicProfile = await referenceApi.publicProfile(user.id)
    } catch (error) {
      if (error.status !== 404) throw error
    }
  }
  return toViewerProfile(user, publicProfile)
}

/**
 * My profile (approved design; not in Figma): profile summary, account shortcuts, verification,
 * edit form (preview until the backend exists) and the reviews other students left.
 */
export default function ProfilePage() {
  const { t } = useTranslation()
  const { data: profile, error, isLoading, reload } = useAsyncData(
    () => (USES_BACKEND_AUTH ? loadBackendProfile() : accountService.getMyProfile()),
    'my-profile',
  )
  const attention = useOrderAttention()
  const [isEditing, setIsEditing] = useState(false)

  const shortcuts = [
    { label: 'My listings', description: 'Edit, check review status or delete', Icon: TagIcon, to: PATHS.myListings },
    { label: withCount(t, 'My orders', attention.buyer), description: 'Things you are buying', Icon: PackageIcon, to: PATHS.orders },
    { label: withCount(t, 'My sales', attention.seller), description: 'Orders from your buyers', Icon: ShoppingCartIcon, to: PATHS.sales },
    { label: 'Shop dashboard', description: 'Listings, orders to handle and reviews', Icon: StoreIcon, to: PATHS.shop },
    { label: 'Saved items', description: 'Listings you’ve hearted', Icon: HeartIcon, to: PATHS.saved },
    { label: 'Settings', description: 'Language, account and demo data', Icon: SettingsIcon, to: PATHS.settings },
    { label: 'Sell an item', description: 'Listing is always free', Icon: PlusIcon, to: PATHS.sell },
  ]

  let content
  if (error) {
    content = <ErrorState title={t("Couldn’t load your profile")} message={t(error.message)} onRetry={reload} />
  } else if (isLoading) {
    content = (
      <div className="grid animate-pulse gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]" aria-busy="true" aria-label={t("Loading profile")}>
        <div className="h-96 rounded-card bg-subtle" />
        <div className="flex flex-col gap-6">
          <div className="h-40 rounded-card bg-subtle" />
          <div className="h-64 rounded-card bg-subtle" />
        </div>
      </div>
    )
  } else {
    content = (
      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <ProfileCard
          profile={profile}
          titleAs="h2"
          className="lg:sticky lg:top-36"
          actions={
            USES_BACKEND_AUTH ? (
              <p className="text-xs text-ink-muted">{t('Editing your profile and contact details will be connected in a later stage.')}</p>
            ) : (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(true)} disabled={isEditing}>
                <PencilIcon className="size-4" />
                {t("Edit profile")}
              </Button>
              <Link to={PATHS.user(profile.id)} className="inline-flex min-h-6 items-center justify-center gap-1 py-1 text-sm font-semibold text-primary hover:underline">
                {t("See your public profile")}
                <ArrowRightIcon className="size-4" />
              </Link>
            </>
            )
          }
        />

        <div className="flex flex-col gap-6">
          {isEditing && (
            <Section id="edit-profile-title" title={t("Edit profile")} description={t("This is what other students see next to your listings and orders.")}>
              <ProfileForm profile={profile} onCancel={() => setIsEditing(false)} />
            </Section>
          )}

          <nav aria-label={t("Your account")}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {shortcuts.map(({ label, description, Icon, to }) => (
                <li key={to}>
                  <Link to={to} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-primary">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink group-hover:text-primary">{t(label)}</span>
                      <span className="block text-sm text-ink-muted">{t(description)}</span>
                    </span>
                    <ArrowRightIcon className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="verification-title" title={t("Verification")}>
            <VerificationStatus profile={profile} />
          </Section>

          {!USES_BACKEND_AUTH && (
            <Section id="reviews-title" title={t("Reviews about you")} description={t("Left by students you bought from or sold to, after completed orders.")}>
              <ReviewList userId={profile.id} rating={profile.rating} emptyText="Complete an order and ask the other student to leave a review." />
            </Section>
          )}
        </div>
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{t("My profile · UniMarket")}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My profile' }]} />
      <header className="mt-4 mb-5 flex items-center gap-3">
        <UserIcon className="hidden size-7 text-primary sm:block" />
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">{t("My profile")}</h1>
      </header>
      {!USES_BACKEND_AUTH && (
        <SampleDataNotice className="mb-6">
          {t("You’re seeing the profile of a demo student. Sign-in isn’t connected yet, so profile changes can’t be saved.")}
        </SampleDataNotice>
      )}
      {content}
    </PageContainer>
  )
}
