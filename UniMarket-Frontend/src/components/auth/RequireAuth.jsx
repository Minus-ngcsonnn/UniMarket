import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { USES_BACKEND_AUTH } from '../../config/apiConfig'
import useSession from '../../hooks/useSession'
import useTranslation from '../../i18n/useTranslation'
import { loginUrl, PATHS } from '../../routes/paths'
import { buttonClasses } from '../ui/buttonClasses'
import EmptyState from '../ui/EmptyState'
import LoadingState from '../ui/LoadingState'
import PageContainer from '../layout/PageContainer'

/**
 * Route guard for account pages when the real backend is used (VITE_AUTH_MODE=backend).
 * - Signed out → /login?next=<this page>.
 * - `role` given (e.g. 'ADMIN') and the server-provided role differs → "not allowed" (the API enforces it too).
 * - While a stored session is being checked (page refresh) → loading state, so nothing flashes.
 * In demo mode it renders the page unchanged (previous behaviour).
 *
 * This is navigation only: the backend checks the token and role on every protected API call.
 */
export default function RequireAuth({ role, fullScreen = false }) {
  const { t } = useTranslation()
  const location = useLocation()
  const auth = useSession()

  if (!USES_BACKEND_AUTH) return <Outlet />
  if (auth.status === 'restoring') return <LoadingState className={fullScreen ? 'min-h-screen' : 'min-h-[50vh]'} message={t('Checking your session…')} />
  if (auth.status !== 'authenticated') {
    return <Navigate to={loginUrl(`${location.pathname}${location.search}`)} replace />
  }
  if (role && auth.user?.role !== role) {
    return (
      <PageContainer className="py-16">
        <EmptyState
          title={t('You don’t have access to this page')}
          description={t('This area is for UniMarket administrators only.')}
          action={
            <Link to={PATHS.home} className={buttonClasses({ variant: 'secondary' })}>
              {t('Back to home')}
            </Link>
          }
        />
      </PageContainer>
    )
  }
  return <Outlet />
}
