import { CAMPUSES, UNIVERSITY_NAME } from '../../constants/product'
import { MapPinIcon } from '../icons'
import RatingStars from '../reviews/RatingStars'
import Avatar from '../ui/Avatar'
import VerificationBadge from './VerificationBadge'
import useTranslation from '../../i18n/useTranslation'
import { affiliationLabel } from '../../services/auth/viewerProfile'


/**
 * Student profile summary: avatar, name, verification, programme, campus, rating and activity.
 * Real accounts (backend): the official "university · campus" or the self-declared school name, the home area,
 * and "–" for numbers the backend does not provide yet.
 * @param {React.ReactNode} [actions] buttons under the summary (edit, report…)
 * @param {'h1'|'h2'} [titleAs]
 */
export default function ProfileCard({ profile, actions, titleAs: Title = 'h1', className = '' }) {
  const { t, lang } = useTranslation()
  const { rating, stats } = profile
  const facts = [
    ['Active listings', stats.activeListings ?? '–'],
    ['Sales', stats.completedSales ?? '–'],
    ['Purchases', stats.completedPurchases ?? '–'],
  ]
  const place = profile.isBackendUser
    ? [affiliationLabel(t, profile), profile.homeZone && `${profile.homeZone.name}, ${profile.homeZone.province}`].filter(Boolean).join(' · ')
    : `${t(UNIVERSITY_NAME)} · ${t(CAMPUSES[profile.campus]?.label)}`

  return (
    <section aria-label={t("Profile")} className={`flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <Avatar name={profile.name} size="xl" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Title className="text-xl leading-tight font-bold tracking-tight text-ink sm:text-2xl">{profile.name}</Title>
          <VerificationBadge user={profile} className="w-fit" />
          {profile.programme && <p className="text-sm text-ink-muted">{profile.programme}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm text-ink-muted">
        <p className="flex items-center gap-1.5">
          <MapPinIcon className="size-4 shrink-0 text-primary" />
          {place || t('University not set')}
        </p>
        <p>{t('Member since {date}', { date: new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(profile.memberSince)) })}</p>
        <p className="flex flex-wrap items-center gap-2">
          {rating.count > 0 && rating.average != null ? (
            <>
              <RatingStars value={rating.average} size="sm" />
              <span className="font-medium text-ink">{rating.average.toFixed(1)}</span>
              <span>
                ({t(rating.count === 1 ? '{count} review' : '{count} reviews', { count: rating.count })})
              </span>
            </>
          ) : (
            t('No reviews yet')
          )}
        </p>
      </div>

      {profile.bio && <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{profile.bio}</p>}

      <dl className="grid grid-cols-3 divide-x divide-line rounded-control bg-subtle py-3 text-center">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-0.5 px-2">
            <dt className="text-xs text-ink-muted">{t(label)}</dt>
            <dd className="text-lg font-semibold text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {actions && <div className="flex flex-col gap-2">{actions}</div>}
    </section>
  )
}
