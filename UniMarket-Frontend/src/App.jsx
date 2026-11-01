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

// Entry pages (home, sign-in) load immediately. Every other page is code-split and loaded on first
// visit, which keeps the initial download small.
const CatalogPage = lazy(() => import('./pages/products/CatalogPage'))
const ProductDetailPage = lazy(() => import('./pages/products/ProductDetailPage'))
const CreateListingPage = lazy(() => import('./pages/products/CreateListingPage'))
const EditListingPage = lazy(() => import('./pages/products/EditListingPage'))
const MyListingsPage = lazy(() => import('./pages/products/MyListingsPage'))
const DealsPage = lazy(() => import('./pages/products/DealsPage'))
const CartPage = lazy(() => import('./pages/checkout/CartPage'))
const CheckoutPage = lazy(() => import('./pages/checkout/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('./pages/orders/OrderConfirmationPage'))
const OrdersPage = lazy(() => import('./pages/orders/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'))
const UserProfilePage = lazy(() => import('./pages/profile/UserProfilePage'))
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'))
const AdminProductsPage = lazy(() => import('./pages/admin/AdminProductsPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'))
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'))
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'))
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
          <Route path={PATHS.sell} element={page(CreateListingPage)} />
          <Route path={PATHS.myListings} element={page(MyListingsPage)} />
          <Route path="/my-listings/:id/edit" element={page(EditListingPage)} />
          <Route path={PATHS.deals} element={page(DealsPage)} />

          {/* Buying: cart → checkout → confirmation → my orders (Business Plan order flow) */}
          <Route path={PATHS.cart} element={page(CartPage)} />
          <Route path="/checkout" element={page(CheckoutPage)} />
          <Route path="/orders/confirmation" element={page(OrderConfirmationPage)} />
          <Route path={PATHS.orders} element={page(OrdersPage)} />
          <Route path="/orders/:id" element={page(OrderDetailPage)} />
          <Route path={PATHS.messages} element={page(MessagesPage)} />

          {/* Profiles and reviews */}
          <Route path={PATHS.profile} element={page(ProfilePage)} />
          <Route path="/users/:id" element={page(UserProfilePage)} />

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

        {/* Admin workspace (Figma admin dashboard). The backend must enforce admin access; see AdminLayout. */}
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
          <Route path="*" element={<NotAvailablePage />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route path={PATHS.login} element={<LoginPage />} />
          <Route path={PATHS.register} element={<RegisterPage />} />
        </Route>

        {UiPreviewPage && <Route path="/dev/ui" element={page(UiPreviewPage)} />}
      </Routes>
    </>
  )
}
