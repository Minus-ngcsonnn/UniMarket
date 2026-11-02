import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { FlagIcon, TagIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ReportDialog from '../../components/moderation/ReportDialog'
import ProductGrid from '../../components/product/ProductGrid'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import ProfileCard from '../../components/profile/ProfileCard'
import ReviewList from '../../components/reviews/ReviewList'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { accountService } from '../../services/account/accountService'
import { productService } from '../../services/products/productService'
import useTranslation from '../../i18n/useTranslation'

/** Listings this student is selling right now (approved and available only). */
function UserListings({ userId, name }) {
  const { t } = useTranslation()
  const { data, error, isLoading, reload } = useAsyncData(() => productService.listUserListings(userId), `user-listings-${userId}`)
  if (error) return <ErrorState title={t("Couldn’t load listings")} message={error.message} onRetry={reload} />
  if (isLoading) return <div className="h-48 animate-pulse rounded-card bg-subtle" aria-busy="true" aria-label={t("Loading listings")} />
  if (data.length === 0) {
    return <EmptyState icon={<TagIcon className="size-6" />} title={t("Nothing for sale right now")} description={`${name} has no active listings at the moment.`} className="py-8" />
  }
  return <ProductGrid products={data} layout="wide" label={`Listings by ${name}`} />
}

/** Public student profile (approved design; not in Figma): summary, active listings and reviews. */
export default function UserProfilePage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data: profile, error, isLoading, reload } = useAsyncData(() => accountService.getUserProfile(id), `user-${id}`)
  const [isReporting, setIsReporting] = useState(false)
  const isOwnProfile = id === productService.getCurrentUserId()

  let content
  if (error) {
    content = <ErrorState title={t("Couldn’t load this profile")} message={error.message} onRetry={reload} />
  } else if (isLoading) {
    content = <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy="true" aria-label={t("Loading profile")} />
  } else if (!profile) {
    content = (
      <EmptyState
        titleAs="h1"
        title={t("Student not found")}
        description={t("This account may have been closed, or the link is not correct.")}
        action={
          <Link to={PATHS.marketplace} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t("Back to marketplace")}
          </Link>
        }
      />
    )
  } else {
    const firstName = profile.name.split(' ')[0]
    content = (
      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-36">
          <ProfileCard
            profile={profile}
            actions={
              isOwnProfile ? (
                <Link to={PATHS.profile} className={buttonClasses({ variant: 'secondary' })}>
                  {t("Manage your profile")}
                </Link>
              ) : null
            }
          />
          {!isOwnProfile && (
            <Button variant="ghost" size="sm" className="w-fit self-center text-ink-muted" onClick={() => setIsReporting(true)}>
              <FlagIcon className="size-4" />
              {t("Report this student")}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-8">
          {profile.status === 'SUSPENDED' && (
            <Alert variant="warning" title={t("This account is suspended")}>
              {t('{name} can’t buy or sell on UniMarket at the moment.', { name: firstName })}
            </Alert>
          )}
          {isOwnProfile && <Alert variant="info">{t("This is how other students see your profile.")}</Alert>}

          <section aria-labelledby="listings-title">
            <h2 id="listings-title" className="mb-4 text-xl font-extrabold tracking-tight text-ink">
              {t('For sale by {name}', { name: firstName })}
            </h2>
            {profile.status === 'SUSPENDED' ? (
              <p className="text-sm text-ink-muted">{t("Listings of suspended accounts are hidden.")}</p>
            ) : (
              <UserListings userId={profile.id} name={firstName} />
            )}
          </section>

          <section aria-labelledby="reviews-title">
            <h2 id="reviews-title" className="mb-4 text-xl font-extrabold tracking-tight text-ink">
              {t("Reviews")}
            </h2>
            <ReviewList userId={profile.id} rating={profile.rating} emptyText={`${firstName} hasn’t received any reviews yet.`} />
          </section>
        </div>

        {isReporting && <ReportDialog target={{ type: 'USER', id: profile.id, label: profile.name }} onClose={() => setIsReporting(false)} />}
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>{profile ? `${profile.name} · UniMarket` : 'Student profile · UniMarket'}</title>
      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'Explore marketplace', to: PATHS.marketplace }, { label: profile?.name ?? 'Student profile' }]} />
      <SampleDataNotice className="mt-5 mb-6">{t("Students, listings and reviews on this page are examples for development.")}</SampleDataNotice>
      {content}
    </PageContainer>
  )
}
