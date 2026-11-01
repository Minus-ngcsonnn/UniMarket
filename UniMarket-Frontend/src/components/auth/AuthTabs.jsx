import { NavLink } from 'react-router'
import { PATHS } from '../../routes/paths'

const TABS = [
  { label: 'Login', to: PATHS.login },
  { label: 'Register', to: PATHS.register },
]

/** Login | Register switch (Figma segmented control). Each tab is a real link to its page. */
export default function AuthTabs() {
  return (
    <nav aria-label="Account access" className="grid grid-cols-2 gap-1 rounded-control bg-subtle p-1">
      {TABS.map(({ label, to }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors ${
              isActive ? 'bg-surface text-primary shadow-sm ring-1 ring-line' : 'text-ink-muted hover:text-ink'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
