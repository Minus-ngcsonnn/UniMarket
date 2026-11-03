import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import { AlertTriangleIcon, BadgeCheckIcon, LockIcon, MapPinIcon, PackageIcon, ShieldCheckIcon } from '../../components/icons'
import { buttonClasses } from '../../components/ui/buttonClasses'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'

const TIPS = [
  {
    Icon: LockIcon,
    title: 'Pay only through UniMarket',
    points: ['Pay online on UniMarket after the seller confirms.', 'Never pay cash or transfer money to a seller directly, even if asked.', 'Sellers: never accept payment outside UniMarket.'],
  },
  {
    Icon: BadgeCheckIcon,
    title: 'Deal with email-verified accounts',
    points: ['Every account verifies its email with a one-time code.', 'Look for the “Email verified” badge on the seller card.', 'Keep conversations and agreements on UniMarket.'],
  },
  {
    Icon: PackageIcon,
    title: 'Check the listing',
    points: ['Read the condition and description, and look at every photo.', 'Ask the seller about anything unclear before ordering.', 'Only confirm receipt once the item matches the listing.'],
  },
  {
    Icon: ShieldCheckIcon,
    title: 'Sell honestly',
    points: ['Use your own photos and describe wear or missing parts.', 'Deliver only after the order shows “Paid”.', 'Decline orders you can’t fulfil, so the buyer isn’t left waiting.'],
  },
  {
    Icon: MapPinIcon,
    title: 'Deliver safely on campus',
    points: ['Use the campus address given at checkout.', 'Prefer busy, well-lit places such as building entrances.', 'Don’t share more personal information than needed.'],
  },
  {
    Icon: AlertTriangleIcon,
    title: 'Report problems',
    points: ['Report suspicious listings, users or payment requests.', 'Include the listing ID (UM-…) or order number (UO-…).', 'If you feel unsafe, contact campus security first.'],
  },
]

/** Safety & trust guidelines, based on the Business Plan rules (email-verified accounts, online payment only). */
export default function SafetyPage() {
  const { t } = useTranslation()
  return (
    <ContentPage
      eyebrow="Safety & trust"
      title="A safer marketplace starts with students like you"
      intro="UniMarket is built around email-verified student accounts and protected online payments. These simple habits keep every trade safe."
    >
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TIPS.map(({ Icon, title, points }) => (
          <li key={title} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
            <span className="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary">
              <Icon className="size-5" />
            </span>
            <h2 className="font-semibold text-ink">{t(title)}</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
              {points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {t(point)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary-soft p-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-ink">{t('Something doesn’t feel right?')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('Tell us about a listing, user or payment request and we’ll look into it.')}</p>
        </div>
        <Link to={PATHS.contact} className={buttonClasses()}>
          {t('Report a problem')}
        </Link>
      </div>
    </ContentPage>
  )
}
