import { Link, NavLink, useLocation } from 'react-router'
import { BRAND_COPY } from '../../constants/brandCopy'
import useCart from '../../hooks/useCart'
import { PATHS } from '../../routes/paths'
import { CircleUserIcon, MapPinIcon, MessageCircleIcon, PackageIcon, PlusIcon, ShoppingCartIcon, SparklesIcon, TagIcon } from '../icons'
import ActionMenu from '../ui/ActionMenu'
import { buttonClasses } from '../ui/buttonClasses'
import Logo from './Logo'
import PageContainer from './PageContainer'
import SearchBar from './SearchBar'

// Same items as the Figma shopping-cart header.
const MAIN_NAV = [
  { label: 'Explore marketplace', to: PATHS.marketplace },
  { label: 'Student deals', to: PATHS.deals },
  { label: 'How it works', to: PATHS.howItWorks },
]

// Until authentication exists the account menu offers sign-in plus the student's marketplace pages.
const ACCOUNT_MENU = [
  { label: 'Sign in', Icon: CircleUserIcon, to: PATHS.login },
  { label: 'Create account', Icon: PlusIcon, to: PATHS.register },
  { label: 'My orders', Icon: PackageIcon, to: PATHS.orders },
  { label: 'My sales', Icon: ShoppingCartIcon, to: PATHS.sales },
  { label: 'My listings', Icon: TagIcon, to: PATHS.myListings },
]

const iconLinkClass = ({ isActive }) =>
  `relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-subtle hover:text-primary sm:size-10 ${isActive ? 'text-primary' : 'text-ink'}`

/**
 * Site header from the Figma design: announcement bar, logo + search + account actions, sub-navigation.
 * From md up, the header (without the announcement bar) stays at the top while scrolling.
 * Mobile layout (search on its own row, icon-only "Sell" button, non-sticky) is a responsive adaptation.
 */
export default function Header() {
  const location = useLocation()
  const { count: cartCount } = useCart()
  // On the catalog, the search field shows the current ?q=. The key remounts it when the URL changes
  // (e.g. the "Search" filter chip is removed), so it never shows a stale query.
  const currentQuery = location.pathname === PATHS.marketplace ? (new URLSearchParams(location.search).get('q') ?? '') : ''

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
          <SearchBar key={currentQuery} initialQuery={currentQuery} className="order-last w-full md:order-none md:flex-1" />

          <nav aria-label="Account" className="ml-auto flex items-center sm:gap-1 md:ml-0">
            <NavLink to={PATHS.messages} aria-label="Messages" title="Messages" className={iconLinkClass}>
              <MessageCircleIcon className="size-5.5 sm:size-6" />
            </NavLink>
            <NavLink
              to={PATHS.cart}
              aria-label={cartCount ? `Shopping cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : 'Shopping cart'}
              title="Shopping cart"
              className={iconLinkClass}
            >
              <ShoppingCartIcon className="size-5.5 sm:size-6" />
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-surface">
                  {cartCount}
                </span>
              )}
            </NavLink>
            <ActionMenu
              label="Account menu"
              heading="Your account"
              icon={CircleUserIcon}
              iconClassName="size-5.5 text-ink sm:size-6"
              triggerClassName="size-9 rounded-full sm:size-10"
              items={ACCOUNT_MENU}
            />
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
