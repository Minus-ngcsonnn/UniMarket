import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRightIcon, BadgeCheckIcon, MailIcon, PackageIcon, PencilIcon, PlusIcon, ShoppingCartIcon, TagIcon, UserIcon } from '../../components/icons'
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
import { accountService } from '../../services/account/accountService'

function Section({ title, description, action, children, id }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-lg font-bold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Email verification (Q1): university email → "Verified student"; personal email → "Email verified". */
function VerificationStatus({ profile }) {
  const states = profile.verified
    ? { tone: 'bg-primary-soft text-primary', Icon: BadgeCheckIcon, title: 'Verified student', text: 'Your FPT University email is verified. Other students see the Verified student badge on your profile and listings.' }
    : profile.emailVerified
      ? { tone: 'bg-subtle text-ink-muted', Icon: MailIcon, title: 'Email verified', text: 'Your personal email is verified. Add your @fpt.edu.vn email to get the Verified student badge.' }
      : { tone: 'bg-warning-soft text-warning', Icon: MailIcon, title: 'Email not verified', text: 'Verify your email with the one-time code we sent you before buying or selling.' }

  return (
    <div className="flex gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${states.tone}`}>
        <states.Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{states.title}</p>
        <p className="truncate text-sm text-ink">{profile.email}</p>
        <p className="mt-1 text-sm text-ink-muted">{states.text}</p>
      </div>
    </div>
  )
}

const withCount = (label, count) => (count > 0 ? `${label} · ${count} to do` : label)

/**
 * My profile (approved design; not in Figma): profile summary, account shortcuts, verification,
 * edit form (preview until the backend exists) and the reviews other students left.
 */
export default function ProfilePage() {
  const { data: profile, error, isLoading, reload } = useAsyncData(() => accountService.getMyProfile(), 'my-profile')
  const attention = useOrderAttention()
  const [isEditing, setIsEditing] = useState(false)

  const shortcuts = [
    { label: 'My listings', description: 'Edit, check review status or delete', Icon: TagIcon, to: PATHS.myListings },
    { label: withCount('My orders', attention.buyer), description: 'Things you are buying', Icon: PackageIcon, to: PATHS.orders },
    { label: withCount('My sales', attention.seller), description: 'Orders from your buyers', Icon: ShoppingCartIcon, to: PATHS.sales },
    { label: 'Sell an item', description: 'Listing is always free', Icon: PlusIcon, to: PATHS.sell },
  ]

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load your profile" message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = (
      <div className="grid animate-pulse gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]" aria-busy="true" aria-label="Loading profile">
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
            <>
              <Button variant="secondary" onClick={() => setIsEditing(true)} disabled={isEditing}>
                <PencilIcon className="size-4" />
                Edit profile
              </Button>
              <Link to={PATHS.user(profile.id)} className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:underline">
                See your public profile
                <ArrowRightIcon className="size-4" />
              </Link>
            </>
          }
        />

        <div className="flex flex-col gap-6">
          {isEditing && (
            <Section id="edit-profile-title" title="Edit profile" description="This is what other students see next to your listings and orders.">
              <ProfileForm profile={profile} onCancel={() => setIsEditing(false)} />
            </Section>
          )}

          <nav aria-label="Your account">
            <ul className="grid gap-3 sm:grid-cols-2">
              {shortcuts.map(({ label, description, Icon, to }) => (
                <li key={to}>
                  <Link to={to} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-primary">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink group-hover:text-primary">{label}</span>
                      <span className="block text-sm text-ink-muted">{description}</span>
                    </span>
                    <ArrowRightIcon className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="verification-title" title="Verification">
            <VerificationStatus profile={profile} />
          </Section>

          <Section id="reviews-title" title="Reviews about you" description="Left by students you bought from or sold to, after completed orders.">
            <ReviewList userId={profile.id} rating={profile.rating} emptyText="Complete an order and ask the other student to leave a review." />
          </Section>
        </div>
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>My profile · UniMarket</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'My profile' }]} />
      <header className="mt-4 mb-5 flex items-center gap-3">
        <UserIcon className="hidden size-7 text-primary sm:block" />
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">My profile</h1>
      </header>
      <SampleDataNotice className="mb-6">
        You’re seeing the profile of a demo student. Sign-in isn’t connected yet, so profile changes can’t be saved.
      </SampleDataNotice>
      {content}
    </PageContainer>
  )
}
