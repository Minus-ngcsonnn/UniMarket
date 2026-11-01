import { Link, NavLink } from 'react-router'
import { PATHS } from '../../routes/paths'
import { FlagIcon, HelpCircleIcon, LayersIcon, LayoutDashboardIcon, PackageIcon, TagIcon, UsersIcon } from '../icons'
import Logo from '../layout/Logo'

const NAV = [
  { label: 'Overview', to: PATHS.admin, Icon: LayoutDashboardIcon, end: true },
  { label: 'Users', to: PATHS.adminUsers, Icon: UsersIcon },
  { label: 'Products', to: PATHS.adminProducts, Icon: TagIcon, countKey: 'pendingListings', countLabel: 'awaiting review' },
  { label: 'Orders', to: PATHS.adminOrders, Icon: PackageIcon },
  { label: 'Categories', to: PATHS.adminCategories, Icon: LayersIcon },
  { label: 'Violation reports', to: PATHS.adminReports, Icon: FlagIcon, countKey: 'openReports', countLabel: 'open' },
]

/**
 * Admin sidebar (Figma): logo, "Admin workspace", sections with counts, campus community card and
 * help link. Used fixed on large screens and inside a drawer on small screens.
 * @param {{ pendingListings?: number, openReports?: number }} [counts]
 * @param {() => void} [onNavigate] closes the mobile drawer after a link is chosen
 */
export default function AdminSidebar({ counts = {}, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="px-2">
        <Logo />
        <p className="mt-3 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Admin workspace</p>
      </div>

      <nav aria-label="Admin sections">
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
                      isActive ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-ink-muted hover:bg-subtle hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="size-4.5" />
                      <span className="flex-1">{label}</span>
                      {count > 0 && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${isActive ? 'bg-white/20 text-white' : 'bg-primary-soft text-primary'}`}
                          aria-label={`${count} ${countLabel}`}
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
        <div className="rounded-card bg-navy p-4 text-white">
          <p className="text-xs font-semibold tracking-wide text-lime uppercase">Campus community</p>
          <p className="mt-1.5 text-sm text-white/80">Keep UniMarket safe: review new listings and open reports first.</p>
          <Link to={PATHS.safety} onClick={onNavigate} className="mt-3 inline-block text-sm font-semibold text-lime hover:underline">
            Safety guidelines →
          </Link>
        </div>
        <Link to={PATHS.help} onClick={onNavigate} className="flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium text-ink-muted hover:bg-subtle hover:text-ink">
          <HelpCircleIcon className="size-4.5" />
          Help & documentation
        </Link>
      </div>
    </div>
  )
}
