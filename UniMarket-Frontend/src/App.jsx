import { lazy, Suspense } from 'react'
import { USE_MOCK_ADMIN } from './config/dataSource'
import { Route, Routes } from 'react-router'
import AuthLayout from './components/auth/AuthLayout'
import RequireAuth from './components/auth/RequireAuth'
import MainLayout from './components/layout/MainLayout'
import ScrollToTop from './components/layout/ScrollToTop'
import LoadingState from './components/ui/LoadingState'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import VerifyEmailPage from './pages/auth/VerifyEmailPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import NotAvailablePage from './pages/NotAvailablePage'
import { PATHS } from './routes/paths'

// Entry pages (home, sign-in) load immediately. Every other page is code-split and loaded on first
// visit, which keeps the initial download small.
const CatalogPage = lazy(() => import('./pages/products/CatalogPage'))
const ProductDetailPage = lazy(() => import('./pages/products/ProductDetailPage'))
const CreateListingPage = lazy(() => import('./pages/products/CreateListingPage'))
const EditListingPage = lazy(() => import('./pages/products/EditListingPage'))
const MyListingsPage = lazy(() => import('./pages/products/MyListingsPage'))
const DealsPage = lazy(() => import('./pages/products/DealsPage'))
const SavedItemsPage = lazy(() => import('./pages/products/SavedItemsPage'))
const CartPage = lazy(() => import('./pages/checkout/CartPage'))
const CheckoutPage = lazy(() => import('./pages/checkout/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('./pages/orders/OrderConfirmationPage'))
const OrdersPage = lazy(() => import('./pages/orders/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'))
const UserProfilePage = lazy(() => import('./pages/profile/UserProfilePage'))
const ShopDashboardPage = lazy(() => import('./pages/profile/ShopDashboardPage'))
const SettingsPage = lazy(() => import('./pages/profile/SettingsPage'))
// Admin pages: sample-data previews, or (Stage 6.4, VITE_USE_MOCK_ADMIN=false) the live pages on the real Admin API.
const adminPage = (sample, live) => lazy(USE_MOCK_ADMIN ? sample : live)
const AdminOverviewPage = adminPage(() => import('./pages/admin/AdminOverviewPage'), () => import('./pages/admin/live/LiveAdminOverviewPage'))
const AdminProductsPage = adminPage(() => import('./pages/admin/AdminProductsPage'), () => import('./pages/admin/live/LiveAdminProductsPage'))
const AdminUsersPage = adminPage(() => import('./pages/admin/AdminUsersPage'), () => import('./pages/admin/live/LiveAdminUsersPage'))
const AdminOrdersPage = adminPage(() => import('./pages/admin/AdminOrdersPage'), () => import('./pages/admin/live/LiveAdminOrdersPage'))
const AdminCategoriesPage = adminPage(() => import('./pages/admin/AdminCategoriesPage'), () => import('./pages/admin/live/LiveAdminCategoriesPage'))
const AdminReportsPage = adminPage(() => import('./pages/admin/AdminReportsPage'), () => import('./pages/admin/live/LiveAdminReportsPage'))
const AdminDisputesPage = lazy(() => import('./pages/admin/live/LiveAdminDisputesPage'))
const AdminSettlementsPage = lazy(() => import('./pages/admin/live/LiveAdminSettlementsPage'))
const HowItWorksPage = lazy(() => import('./pages/info/HowItWorksPage'))
const SafetyPage = lazy(() => import('./pages/info/SafetyPage'))
const HelpCenterPage = lazy(() => import('./pages/info/HelpCenterPage'))
const AboutPage = lazy(() => import('./pages/info/AboutPage'))
const ContactPage = lazy(() => import('./pages/info/ContactPage'))
const AmbassadorsPage = lazy(() => import('./pages/info/AmbassadorsPage'))
const PrivacyPage = lazy(() => import('./pages/info/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/info/TermsPage'))

// Development-only component preview. import.meta.env.DEV is false in production builds,
// so Vite drops this route and the page code from the production bundle.
const UiPreviewPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiPreviewPage')) : null

/** Wraps a code-split page so the layout (header/footer) stays visible while it loads. */
const page = (Component) => (
  <Suspense fallback={<LoadingState className="min-h-[50vh]" />}>
    <Component />
  </Suspense>
)

/** Application routes. Add new pages here as features are implemented. */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path={PATHS.marketplace} element={page(CatalogPage)} />
          <Route path="/products/:id" element={page(ProductDetailPage)} />
          <Route path={PATHS.deals} element={page(DealsPage)} />
          <Route path={PATHS.saved} element={page(SavedItemsPage)} />
          <Route path={PATHS.cart} element={page(CartPage)} />
          <Route path="/users/:id" element={page(UserProfilePage)} />

          {/* Account pages. With the real backend (VITE_AUTH_MODE=backend) they need a signed-in account;
              in demo mode RequireAuth renders them unchanged. */}
          <Route element={<RequireAuth />}>
            <Route path={PATHS.sell} element={page(CreateListingPage)} />
            <Route path={PATHS.myListings} element={page(MyListingsPage)} />
            <Route path="/my-listings/:id/edit" element={page(EditListingPage)} />

            {/* Buying: cart → checkout → confirmation → my orders (Business Plan order flow) */}
            <Route path="/checkout" element={page(CheckoutPage)} />
            <Route path="/orders/confirmation" element={page(OrderConfirmationPage)} />
            <Route path={PATHS.orders} element={page(OrdersPage)} />
            <Route path="/orders/:id" element={page(OrderDetailPage)} />
            <Route path={PATHS.messages} element={page(MessagesPage)} />
            <Route path="/messages/:id" element={page(MessagesPage)} />

            {/* Profile */}
            <Route path={PATHS.profile} element={page(ProfilePage)} />
            <Route path={PATHS.shop} element={page(ShopDashboardPage)} />
            <Route path={PATHS.settings} element={page(SettingsPage)} />
          </Route>

          {/* Information pages */}
          <Route path={PATHS.howItWorks} element={page(HowItWorksPage)} />
          <Route path={PATHS.safety} element={page(SafetyPage)} />
          <Route path={PATHS.help} element={page(HelpCenterPage)} />
          <Route path={PATHS.about} element={page(AboutPage)} />
          <Route path={PATHS.contact} element={page(ContactPage)} />
          <Route path={PATHS.ambassadors} element={page(AmbassadorsPage)} />
          <Route path={PATHS.privacy} element={page(PrivacyPage)} />
          <Route path={PATHS.terms} element={page(TermsPage)} />

          {/* Unknown URLs */}
          <Route path="*" element={<NotAvailablePage />} />
        </Route>

        {/* Admin workspace (Figma admin dashboard). With the real backend only ADMIN accounts (role from
            GET /api/auth/me) can open it; the backend enforces admin access on every admin API call. */}
        <Route element={<RequireAuth role="ADMIN" fullScreen />}>
          <Route
            path={PATHS.admin}
            element={
              <Suspense fallback={<LoadingState className="min-h-screen" />}>
                <AdminLayout />
              </Suspense>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path={PATHS.adminProducts} element={<AdminProductsPage />} />
            <Route path={PATHS.adminUsers} element={<AdminUsersPage />} />
            <Route path={PATHS.adminOrders} element={<AdminOrdersPage />} />
            <Route path={PATHS.adminCategories} element={<AdminCategoriesPage />} />
            <Route path={PATHS.adminReports} element={<AdminReportsPage />} />
            {!USE_MOCK_ADMIN && <Route path={PATHS.adminDisputes} element={<AdminDisputesPage />} />}
            {!USE_MOCK_ADMIN && <Route path={PATHS.adminSettlements} element={<AdminSettlementsPage />} />}
            <Route path="*" element={<NotAvailablePage />} />
          </Route>
        </Route>

        <Route element={<AuthLayout />}>
          <Route path={PATHS.login} element={<LoginPage />} />
          <Route path={PATHS.register} element={<RegisterPage />} />
          <Route path={PATHS.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={PATHS.forgotPassword} element={<ForgotPasswordPage />} />
        </Route>

        {UiPreviewPage && <Route path="/dev/ui" element={page(UiPreviewPage)} />}
      </Routes>
    </>
  )
}
