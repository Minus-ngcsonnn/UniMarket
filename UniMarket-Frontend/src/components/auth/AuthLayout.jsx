import { Link, Outlet } from 'react-router'
import { PATHS } from '../../routes/paths'
import { ArrowLeftIcon } from '../icons'
import AuthBrandPanel from './AuthBrandPanel'

/**
 * Two-column layout for Login and Register (Figma): brand panel on the left, form on the right.
 * Below the lg breakpoint the form is shown with a compact brand banner above it.
 */
export default function AuthLayout() {
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[minmax(0,37rem)_1fr] lg:p-6">
      <AuthBrandPanel className="hidden lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)]" />

      <div className="flex min-h-screen flex-col px-4 py-6 sm:px-8 lg:min-h-0 lg:px-12">
        <div className="mx-auto flex w-full max-w-[30rem] items-center justify-between text-sm text-ink-muted">
          <Link to={PATHS.home} className="inline-flex min-h-6 items-center gap-1.5 transition-colors hover:text-ink">
            <ArrowLeftIcon className="size-4" />
            Marketplace
          </Link>
          <Link to={PATHS.help} className="inline-flex min-h-6 items-center transition-colors hover:text-ink">
            Need help?
          </Link>
        </div>

        <main id="main" className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col justify-center py-6 sm:py-10">
          <AuthBrandPanel variant="compact" className="mb-8 lg:hidden" />
          <Outlet />
        </main>

        <footer className="mx-auto flex w-full max-w-[30rem] flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <p>© {year} UniMarket</p>
          <nav aria-label="Legal" className="flex items-center gap-2">
            <Link to={PATHS.privacy} className="inline-flex min-h-6 items-center hover:text-ink">
              Privacy policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link to={PATHS.terms} className="inline-flex min-h-6 items-center hover:text-ink">
              Terms of service
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  )
}
