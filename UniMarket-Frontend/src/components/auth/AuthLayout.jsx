import { Link, Outlet } from 'react-router'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { ArrowLeftIcon } from '../icons'
import LanguageMenu from '../layout/LanguageMenu'
import AuthBrandPanel from './AuthBrandPanel'

/**
 * Shared layout of Sign In, Sign Up, email verification and password reset (approved Nov 2026 design): one large
 * rounded card centred on a soft blue page. Desktop (lg+): light-blue brand panel on the left, the form on white on
 * the right. Mobile / tablet: one column with a compact brand header above the form. The card grows with the form
 * (no inner scrolling), so long forms such as Register stay fully visible.
 */
export default function AuthLayout() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <div className="relative isolate flex min-h-screen flex-col lg:justify-center overflow-x-clip bg-linear-to-b from-primary-soft/70 via-canvas to-primary-soft/50 px-3 py-4 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* Decorative page shapes (purely visual). */}
      <span aria-hidden="true" className="pointer-events-none absolute top-1/3 -left-32 -z-10 size-96 rounded-full bg-primary/5 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-0 -z-10 size-96 rounded-full bg-primary/5 blur-3xl" />

      <div className="mx-auto grid w-full max-w-xl flex-1 rounded-[1.75rem] bg-surface shadow-[0_24px_64px_-24px_rgb(36_89_224/0.28),0_2px_8px_rgb(24_36_59/0.05)] ring-1 ring-primary/10 lg:max-w-6xl lg:flex-none lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:rounded-[2rem]">
        <AuthBrandPanel className="hidden lg:block lg:rounded-l-[2rem]" />

        <div className="flex min-w-0 flex-col">
          <AuthBrandPanel variant="compact" className="rounded-t-[1.75rem] lg:hidden" />

          <div className="flex flex-1 flex-col px-6 pt-5 pb-8 sm:px-10 sm:pb-10 lg:px-12 lg:pt-8 xl:px-16">
            <div className="flex items-center justify-between gap-3 text-sm text-ink-muted">
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

            <main id="main" className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col justify-center pt-6 sm:pt-8 lg:pt-10">
              <Outlet />
            </main>
          </div>
        </div>
      </div>

      <footer className="mx-auto mt-4 flex w-full max-w-xl flex-wrap items-center justify-between gap-2 px-2 text-xs text-ink-muted lg:max-w-6xl">
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
  )
}
