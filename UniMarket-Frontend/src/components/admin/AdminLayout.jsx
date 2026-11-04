import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { adminService } from '../../services/admin/adminService'
import { USE_MOCK_ADMIN } from '../../config/dataSource'
import useSession from '../../hooks/useSession'
import { adminBackendApi, onAdminChanged } from '../../services/admin/adminBackendApi'
import { isSampleData } from '../../services/products/productService'
import { InfoIcon, LockIcon } from '../icons'
import { buttonClasses } from '../ui/buttonClasses'
import EmptyState from '../ui/EmptyState'
import LoadingState from '../ui/LoadingState'
import Modal from '../ui/Modal'
import AdminSidebar from './AdminSidebar'
import AdminTopbar from './AdminTopbar'
import useTranslation from '../../i18n/useTranslation'

/**
 * Without sample data there is no admin sign-in yet, so the workspace is not shown.
 * This is only a convenience: ADMIN ACCESS MUST BE ENFORCED BY THE BACKEND on every admin request.
 */
function AdminUnavailable() {
  const { t } = useTranslation()
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <EmptyState
        titleAs="h1"
        icon={<LockIcon className="size-6" />}
        title={t("Admin sign-in isn’t available yet")}
        description={t("The admin workspace needs an admin account, which the UniMarket backend will check. It isn’t connected yet.")}
        action={
          <Link to={PATHS.home} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t("Back to UniMarket")}
          </Link>
        }
        className="w-full max-w-lg"
      />
    </main>
  )
}

/**
 * Admin workspace layout from the Figma admin dashboard: sidebar, top bar (search, campus, notifications)
 * and the page. The campus filter is shared with the pages through the outlet context.
 */
export default function AdminLayout() {
  const { t } = useTranslation()
  const [campus, setCampus] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const live = !USE_MOCK_ADMIN
  const auth = useSession()
  const { data: badges, reload: reloadBadges } = useAsyncData(() => (live ? adminBackendApi.badges() : adminService.getBadgeCounts()), 'admin-badges')
  useEffect(() => (live ? onAdminChanged(reloadBadges) : undefined), [live, reloadBadges])
  // Real API: the signed-in admin comes from GET /api/auth/me (RequireAuth role="ADMIN" already checked the role).
  const data = live && badges ? { ...badges, admin: { name: auth.user?.fullName, title: 'Admin' } } : badges

  if (!live && !isSampleData) return <AdminUnavailable />

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary"
      >
        {t("Skip to content")}
      </a>

      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <AdminSidebar counts={data} />
      </aside>

      {isMenuOpen && (
        <Modal variant="drawer" labelledBy="admin-menu-title" onClose={() => setIsMenuOpen(false)}>
          <h2 id="admin-menu-title" className="sr-only">
            {t("Admin menu")}
          </h2>
          <AdminSidebar counts={data} onNavigate={() => setIsMenuOpen(false)} />
        </Modal>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20">
          <AdminTopbar campus={campus} onCampusChange={setCampus} counts={data} admin={data?.admin} onOpenMenu={() => setIsMenuOpen(true)} live={live} />
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {live ? (
            <p role="note" className="mb-6 flex items-start gap-2 rounded-control border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-ink">
              <InfoIcon className="mt-px size-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">{t('Live admin data.')}</span>{' '}
                {t('Actions change real records and are written to the admin audit log. Payments, refunds and payouts are simulated: no money is moved.')}
              </span>
            </p>
          ) : (
            <p role="note" className="mb-6 flex items-start gap-2 rounded-control border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-ink">
              <InfoIcon className="mt-px size-4 shrink-0 text-warning" />
              <span>
                <span className="font-semibold">{t("Admin demo with sample data.")}</span>{' '}
                {t('Actions are previews: they are checked but nothing is changed, blocked or suspended. Admin access will be enforced by the backend.')}
              </span>
            </p>
          )}
          <Suspense fallback={<LoadingState className="min-h-[40vh]" />}>
            <Outlet context={{ campus, admin: data?.admin, counts: data }} />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
