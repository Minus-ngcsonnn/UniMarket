import { Link, Outlet } from 'react-router'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { ArrowLeftIcon } from '../icons'
import LanguageMenu from '../layout/LanguageMenu'
import AuthBrandPanel from './AuthBrandPanel'

/**
 * Two-column layout for Sign In and Sign Up ("Warm Minimal" redesign): brand card on the left, the form
 * in a white card on the warm page background on the right. Below lg the brand card becomes a small
 * banner (logo + community label) above the form.
 */
export default function AuthLayout() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,36rem)_1fr] lg:gap-6 lg:p-6">
      <AuthBrandPanel className="hidden lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)]" />

      <div className="flex min-h-screen flex-col px-4 py-6 sm:px-8 lg:min-h-0 lg:px-6">
        <div className="mx-auto flex w-full max-w-[30rem] items-center justify-between gap-3 text-sm text-ink-muted">
          <Link to={PATHS.home} className="inline-flex min-h-6 items-center gap-1.5 transition-colors hover:text-ink">
            <ArrowLeftIcon className="size-4" />
            {t('auth.backToMarketplace')}
          </Link>
          <div className="flex items-center gap-1">
            <Link to={PATHS.help} className="inline-flex min-h-6 items-center px-1 transition-colors hover:text-ink">
              {t('auth.needHelp')}
            </Link>
            <LanguageMenu />
          </div>
        </div>

        <main id="main" className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col justify-center py-6 sm:py-10">
          <AuthBrandPanel variant="compact" className="mb-6 lg:hidden" />
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <Outlet />
          </div>
        </main>

        <footer className="mx-auto flex w-full max-w-[30rem] flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <p>© {year} UniMarket</p>
          <nav aria-label={t('footer.legal')} className="flex items-center gap-2">
            <Link to={PATHS.privacy} className="inline-flex min-h-6 items-center hover:text-ink">
              {t('footer.privacy')}
            </Link>
            <span aria-hidden="true">·</span>
            <Link to={PATHS.terms} className="inline-flex min-h-6 items-center hover:text-ink">
              {t('footer.terms')}
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  )
}
