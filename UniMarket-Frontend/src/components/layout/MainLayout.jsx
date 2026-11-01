import { Outlet } from 'react-router'
import DevBackendBadge from '../dev/DevBackendBadge'
import Footer from './Footer'
import Header from './Header'

/** Layout for marketplace pages: header, page content, footer. */
export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />

      {/* Development only: backend health check, kept small so it does not cover the Figma layout. */}
      {import.meta.env.DEV && <DevBackendBadge />}
    </div>
  )
}
