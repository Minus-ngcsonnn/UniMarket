import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import useCart from '../../hooks/useCart'
import useViewer from '../../hooks/useViewer'
import { LANGUAGES } from '../../i18n/languageContext'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { MenuIcon, MessageCircleIcon, PlusIcon, ShoppingCartIcon, XIcon } from '../icons'
import { buttonClasses } from '../ui/buttonClasses'
import Modal from '../ui/Modal'
import AccountMenu from './AccountMenu'
import LanguageMenu from './LanguageMenu'
import Logo from './Logo'
import PageContainer from './PageContainer'
import SearchBar from './SearchBar'

const MAIN_NAV = [
  { key: 'nav.explore', to: PATHS.marketplace },
  { key: 'nav.deals', to: PATHS.deals },
  { key: 'nav.howItWorks', to: PATHS.howItWorks },
]

const iconButton = 'relative flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-subtle hover:text-primary'

/** Small drawer for screens without room for the main navigation (below lg). */
function MobileMenu({ onClose, isGuest, sellTo }) {
  const { t, lang, setLang } = useTranslation()
  return (
    <Modal variant="drawer" labelledBy="mobile-menu-title" onClose={onClose}>
      <div className="flex h-full flex-col gap-6 p-5">
        <div className="flex items-center justify-between">
          <h2 id="mobile-menu-title" className="sr-only">
            {t('nav.menu')}
          </h2>
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close" className={iconButton}>
            <XIcon className="size-5" />
          </button>
        </div>
        <nav aria-label={t('nav.main')}>
          <ul className="flex flex-col gap-1">
            {[...MAIN_NAV, { key: 'header.messages', to: PATHS.messages }].map(({ key, to }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex h-11 items-center rounded-control px-3 text-[15px] font-semibold ${isActive ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-subtle'}`
                  }
                >
                  {t(key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div role="group" aria-label={t('language.label')} className="flex gap-2">
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              aria-pressed={lang === language.code}
              onClick={() => setLang(language.code)}
              className={buttonClasses({ variant: lang === language.code ? 'selected' : 'secondary', size: 'sm', className: 'flex-1' })}
            >
              {language.label}
            </button>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <Link to={sellTo} onClick={onClose} className={buttonClasses({ fullWidth: true, className: 'rounded-full' })}>
            <PlusIcon className="size-4" />
            {t('header.sell')}
          </Link>
          {isGuest && (
            <div className="grid grid-cols-2 gap-2">
              <Link to={PATHS.login} onClick={onClose} className={buttonClasses({ variant: 'secondary' })}>
                {t('header.signIn')}
              </Link>
              <Link to={PATHS.register} onClick={onClose} className={buttonClasses({ variant: 'secondary' })}>
                {t('header.signUp')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/**
 * Site header (approved "Warm Minimal" design): one row with logo, Explore / Student Deals / How It Works,
 * search, language, messages, cart, Sell an Item and the account (avatar menu, or Sign In / Sign Up).
 * Below lg the navigation moves into a drawer and search gets its own row, so it stays usable.
 */
export default function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { count: cartCount } = useCart()
  const viewer = useViewer()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // On the catalog, the search field shows the current ?q=. The key remounts it when the URL changes.
  const currentQuery = location.pathname === PATHS.marketplace ? (new URLSearchParams(location.search).get('q') ?? '') : ''
  // Selling needs an account: guests are sent to sign in first.
  const sellTo = viewer.isGuest ? `${PATHS.login}?next=${encodeURIComponent(PATHS.sell)}` : PATHS.sell

  return (
    <header className="z-40 border-b border-line bg-canvas/95 backdrop-blur md:sticky md:top-0">
      <PageContainer className="flex h-16 items-center gap-2 sm:gap-3 lg:h-[4.5rem] lg:gap-5">
        <button type="button" onClick={() => setIsMenuOpen(true)} aria-label={t('nav.openMenu')} className={`${iconButton} -ml-2 lg:hidden`}>
          <MenuIcon className="size-5" />
        </button>
        <Logo />

        <nav aria-label={t('nav.main')} className="hidden self-stretch lg:flex lg:gap-1 xl:gap-3">
          {MAIN_NAV.map(({ key, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center border-b-2 px-2 pt-0.5 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'border-primary text-primary' : 'border-transparent text-ink hover:text-primary'
                }`
              }
            >
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <SearchBar key={currentQuery} initialQuery={currentQuery} className="hidden min-w-0 flex-1 lg:block lg:max-w-xs xl:max-w-md" />

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
          <LanguageMenu className="hidden sm:block" />
          <NavLink to={PATHS.messages} aria-label={t('header.messages')} title={t('header.messages')} className={`${iconButton} hidden sm:flex`}>
            <MessageCircleIcon className="size-5.5" />
          </NavLink>
          <NavLink
            to={PATHS.cart}
            aria-label={cartCount ? t('header.cartWithCount', { count: cartCount }) : t('header.cart')}
            title={t('header.cart')}
            className={iconButton}
          >
            <ShoppingCartIcon className="size-5.5" />
            {cartCount > 0 && (
              <span className="absolute top-0.5 right-0 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-canvas">
                {cartCount}
              </span>
            )}
          </NavLink>

          <Link to={sellTo} className={buttonClasses({ className: 'ml-1 h-10 rounded-full px-2.5 sm:h-11 sm:px-5' })}>
            <PlusIcon className="size-5" />
            <span className="sr-only sm:not-sr-only">{t('header.sell')}</span>
          </Link>

          {viewer.isGuest ? (
            <div className="ml-1 hidden items-center gap-1 sm:flex">
              <Link to={PATHS.login} className={buttonClasses({ variant: 'ghost', className: 'h-11 rounded-full' })}>
                {t('header.signIn')}
              </Link>
              <Link to={PATHS.register} className={buttonClasses({ variant: 'secondary', className: 'h-11 rounded-full' })}>
                {t('header.signUp')}
              </Link>
            </div>
          ) : viewer.profile ? (
            <div className="ml-1">
              <AccountMenu
                profile={viewer.profile}
                isDemo={viewer.isDemo}
                isAdmin={viewer.isAdmin}
                onSignOut={() => {
                  viewer.signOut()
                  if (viewer.isBackend) navigate(PATHS.home, { replace: true })
                }}
              />
            </div>
          ) : (
            <span className="ml-1 block size-9 animate-pulse rounded-full bg-subtle" aria-hidden="true" />
          )}
        </div>
      </PageContainer>

      <PageContainer className="pb-3 lg:hidden">
        <SearchBar key={`m-${currentQuery}`} initialQuery={currentQuery} shortcut={false} />
      </PageContainer>

      {isMenuOpen && <MobileMenu onClose={() => setIsMenuOpen(false)} isGuest={viewer.isGuest} sellTo={sellTo} />}
    </header>
  )
}
