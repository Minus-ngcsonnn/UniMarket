import { NavLink } from 'react-router'
import { PATHS } from '../../routes/paths'
import useTranslation from '../../i18n/useTranslation'
import { LogInIcon, UserPlusIcon } from '../icons'

const TABS = [
  { label: 'Login', to: PATHS.login, Icon: LogInIcon },
  { label: 'Register', to: PATHS.register, Icon: UserPlusIcon },
]

/** Login | Register switch (segmented control, active tab filled blue). Each tab is a real link to its page. */
export default function AuthTabs() {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('Account access')} className="grid grid-cols-2 gap-1 rounded-xl bg-primary-soft/60 p-1 ring-1 ring-primary/10">
      {TABS.map(({ label, to, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isActive ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-ink-muted hover:bg-surface/70 hover:text-ink'
            }`
          }
        >
          <Icon className="size-4.5" />
          {t(label)}
        </NavLink>
      ))}
    </nav>
  )
}
