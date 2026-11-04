import { Link, NavLink } from 'react-router'
import { PATHS } from '../../routes/paths'
import { USE_MOCK_ADMIN } from '../../config/dataSource'
import { ExternalLinkIcon, FlagIcon, ScaleIcon, WalletIcon, GraduationCapIcon, HelpCircleIcon, LayersIcon, LayoutDashboardIcon, PackageIcon, ShoppingCartIcon, UsersIcon } from '../icons'
import Logo from '../layout/Logo'
import useTranslation from '../../i18n/useTranslation'

const NAV = [
  { label: 'Overview', to: PATHS.admin, Icon: LayoutDashboardIcon, end: true },
  { label: 'Users', to: PATHS.adminUsers, Icon: UsersIcon },
  { label: 'Products', to: PATHS.adminProducts, Icon: PackageIcon, countKey: 'pendingListings', countLabel: 'awaiting review' },
  { label: 'Orders', to: PATHS.adminOrders, Icon: ShoppingCartIcon },
  { label: 'Categories', to: PATHS.adminCategories, Icon: LayersIcon },
  { label: 'Violation reports', to: PATHS.adminReports, Icon: FlagIcon, countKey: 'openReports', countLabel: 'open' },
  // Real API only (no sample data for them).
  { label: 'Disputes', to: PATHS.adminDisputes, Icon: ScaleIcon, countKey: 'openDisputes', countLabel: 'open', live: true },
  { label: 'Settlements', to: PATHS.adminSettlements, Icon: WalletIcon, countKey: 'pendingSettlements', countLabel: 'pending', live: true },
].filter((item) => !item.live || !USE_MOCK_ADMIN)

/**
 * Admin sidebar (Figma): logo, "Admin workspace", sections with counts, campus community card and
 * help link. Used fixed on large screens and inside a drawer on small screens.
 * @param {{ pendingListings?: number, openReports?: number }} [counts]
 * @param {() => void} [onNavigate] closes the mobile drawer after a link is chosen
 */
export default function AdminSidebar({ counts = {}, onNavigate }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="px-2">
        <Logo />
        <p className="mt-6 text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{t("Admin workspace")}</p>
      </div>

      <nav aria-label={t("Admin sections")}>
        <ul className="flex flex-col gap-1">
          {NAV.map(({ label, to, Icon, end, countKey, countLabel }) => {
            const count = countKey ? counts[countKey] : 0
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-subtle'
                    }`
                  }
                >
                  {() => (
                    <>
                      <Icon className="size-4.5" />
                      <span className="flex-1">{t(label)}</span>
                      {count > 0 && (
                        <span
                          className="rounded-full bg-subtle px-2 py-0.5 text-xs text-ink-muted tabular-nums"
                          aria-label={`${count} ${t(countLabel)}`}
                        >
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-card bg-subtle p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <GraduationCapIcon className="size-4.5 text-primary" />
            {t("Campus community")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{t("Keeping student commerce safe, simple, and connected.")}</p>
          <Link to={PATHS.marketplace} onClick={onNavigate} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            {t("View marketplace")}
            <ExternalLinkIcon className="size-3.5" />
          </Link>
        </div>
        <Link to={PATHS.help} onClick={onNavigate} className="flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium text-ink-muted hover:bg-subtle hover:text-ink">
          <HelpCircleIcon className="size-4.5" />
          {t("Help & documentation")}
        </Link>
      </div>
    </div>
  )
}
