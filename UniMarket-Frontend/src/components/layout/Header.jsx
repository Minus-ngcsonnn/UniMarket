import { Link, NavLink } from 'react-router'
import { BRAND_COPY } from '../../constants/brandCopy'
import { PATHS } from '../../routes/paths'
import { CircleUserIcon, MapPinIcon, MessageCircleIcon, PlusIcon, ShoppingCartIcon, SparklesIcon } from '../icons'
import { buttonClasses } from '../ui/buttonClasses'
import Logo from './Logo'
import PageContainer from './PageContainer'
import SearchBar from './SearchBar'

const MAIN_NAV = [
  { label: 'Explore marketplace', to: PATHS.marketplace },
  { label: 'How it works', to: PATHS.howItWorks },
]

const ACCOUNT_LINKS = [
  { label: 'Messages', to: PATHS.messages, Icon: MessageCircleIcon },
  { label: 'Shopping cart', to: PATHS.cart, Icon: ShoppingCartIcon },
  // Until authentication exists, the account icon leads to sign-in.
  { label: 'Sign in', to: PATHS.login, Icon: CircleUserIcon },
]

/**
 * Site header from the Figma design: announcement bar, logo + search + account actions, sub-navigation.
 * From md up, the header (without the announcement bar) stays at the top while scrolling.
 * Mobile layout (search on its own row, icon-only "Sell" button, non-sticky) is a responsive adaptation.
 */
export default function Header() {
  return (
    <>
      <div className="bg-primary text-white">
        <PageContainer className="flex items-center justify-center gap-2 py-2 text-center text-xs sm:text-sm">
          <SparklesIcon className="size-4 shrink-0" />
          <p>{BRAND_COPY.announcement}</p>
        </PageContainer>
      </div>

      <header className="z-40 border-b border-line bg-surface/95 backdrop-blur md:sticky md:top-0">
        <PageContainer className="flex flex-wrap items-center gap-x-3 gap-y-3 py-3 md:flex-nowrap md:gap-6 md:py-4">
          <Logo />
          <SearchBar className="order-last w-full md:order-none md:flex-1" />

          <nav aria-label="Account" className="ml-auto flex items-center sm:gap-1 md:ml-0">
            {ACCOUNT_LINKS.map(({ label, to, Icon }) => (
              <NavLink
                key={to}
                to={to}
                aria-label={label}
                title={label}
                className={({ isActive }) =>
                  `flex size-9 items-center justify-center rounded-full transition-colors hover:bg-subtle hover:text-primary sm:size-10 ${isActive ? 'text-primary' : 'text-ink'}`
                }
              >
                <Icon className="size-5.5 sm:size-6" />
              </NavLink>
            ))}
          </nav>

          <Link to={PATHS.sell} className={buttonClasses({ size: 'lg', className: 'h-10 px-2.5 sm:h-12 sm:px-5' })}>
            <span className="sr-only sm:not-sr-only">Sell an item</span>
            <PlusIcon className="size-5" />
          </Link>
        </PageContainer>

        <div className="border-t border-line">
          <PageContainer className="flex items-center justify-between gap-4">
            <nav aria-label="Main" className="-mb-px flex gap-6 overflow-x-auto">
              {MAIN_NAV.map(({ label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `border-b-2 py-3 text-sm whitespace-nowrap transition-colors ${isActive ? 'border-primary font-medium text-primary' : 'border-transparent text-ink-muted hover:text-ink'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <p className="hidden items-center gap-1.5 text-sm text-ink sm:flex">
              <MapPinIcon className="size-4 text-primary" />
              {BRAND_COPY.campusName}
            </p>
          </PageContainer>
        </div>
      </header>
    </>
  )
}
