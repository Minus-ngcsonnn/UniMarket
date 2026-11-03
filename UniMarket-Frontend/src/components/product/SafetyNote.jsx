import { Link } from 'react-router'
import { PATHS } from '../../routes/paths'
import { BadgeCheckIcon, ShieldCheckIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/**
 * Safety card (Figma catalog sidebar: "Keep it campus-connected.").
 * Text follows the Business Plan: online payment through UniMarket only, never direct transfers.
 * @param {'sidebar'|'inline'} [variant] sidebar card (catalog) or inline banner (product detail)
 */
export default function SafetyNote({ variant = 'sidebar' }) {
  const { t } = useTranslation()
  if (variant === 'inline') {
    return (
      <div className="flex gap-3 rounded-card border border-primary/15 bg-primary-soft p-4">
        <ShieldCheckIcon className="size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium text-ink">{t("Pay securely on UniMarket")}</p>
          <p className="mt-0.5 text-ink-muted">
            {t('Always pay through UniMarket’s online checkout. Never transfer money to a seller directly.')}{' '}
            <Link to={PATHS.safety} className="font-medium text-primary hover:underline">
              {t("More safety tips")}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <aside className="rounded-card bg-subtle p-5">
      <BadgeCheckIcon className="size-5 text-primary" />
      <p className="mt-3 text-sm font-semibold text-ink">{t("Keep it campus-connected.")}</p>
      <p className="mt-1.5 text-sm text-ink-muted">
        {t("Buy from email-verified accounts and pay through UniMarket’s secure checkout, never by direct transfer.")}
      </p>
      <Link to={PATHS.safety} className="mt-2 inline-flex min-h-6 items-center gap-1 py-1 text-sm font-semibold text-primary hover:underline">
        {t("More safety tips →")}
      </Link>
    </aside>
  )
}
