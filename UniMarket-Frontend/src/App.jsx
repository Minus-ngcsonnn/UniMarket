import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import AuthLayout from './components/auth/AuthLayout'
import MainLayout from './components/layout/MainLayout'
import ScrollToTop from './components/layout/ScrollToTop'
import LoadingState from './components/ui/LoadingState'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import HomePage from './pages/HomePage'
import NotAvailablePage from './pages/NotAvailablePage'
import { PATHS } from './routes/paths'

// Development-only component preview. import.meta.env.DEV is false in production builds,
// so Vite drops this route and the page code from the production bundle.
const UiPreviewPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiPreviewPage')) : null

/** Application routes. Add new pages here as features are implemented. */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />
          {/* Planned pages (marketplace, sell, cart, …) and unknown URLs */}
          <Route path="*" element={<NotAvailablePage />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route path={PATHS.login} element={<LoginPage />} />
          <Route path={PATHS.register} element={<RegisterPage />} />
        </Route>

        {UiPreviewPage && (
          <Route
            path="/dev/ui"
            element={
              <Suspense fallback={<LoadingState />}>
                <UiPreviewPage />
              </Suspense>
            }
          />
        )}
      </Routes>
    </>
  )
}
