/**
 * Every URL used by the app, in one place. Use these instead of hard-coded strings.
 * Paths without a page yet fall through to the "not available yet" page (see App.jsx).
 */
export const PATHS = {
  home: '/',
  login: '/login',
  register: '/register',
  /** Email verification (OTP) step; the email is passed in the query string. */
  verifyEmail: '/verify-email',

  // Product marketplace
  marketplace: '/marketplace',
  product: (id) => `/products/${id}`,
  sell: '/sell',
  myListings: '/my-listings',
  editListing: (id) => `/my-listings/${id}/edit`,
  deals: '/deals',
  saved: '/saved',

  // Buying (Business Plan order flow)
  cart: '/cart',
  checkout: (productIds) => `/checkout?items=${[].concat(productIds).join(',')}`,
  orderConfirmation: (orderIds) => `/orders/confirmation?ids=${[].concat(orderIds).join(',')}`,
  orders: '/orders',
  sales: '/orders?view=sales',
  order: (id) => `/orders/${id}`,
  messages: '/messages',

  // Profiles and reviews
  profile: '/profile',
  shop: '/shop',
  settings: '/settings',
  user: (id) => `/users/${id}`,

  // Admin workspace (sample data only until the backend enforces admin access)
  admin: '/admin',
  adminProducts: '/admin/products',
  adminUsers: '/admin/users',
  adminOrders: '/admin/orders',
  adminCategories: '/admin/categories',
  adminReports: '/admin/reports',

  // Information pages
  howItWorks: '/how-it-works',
  about: '/about',
  ambassadors: '/ambassadors',
  help: '/help',
  safety: '/safety',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
}

/** Link to the marketplace with optional search/category filters, e.g. marketplaceUrl({ q: 'calculus' }). */
export function marketplaceUrl(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString()
  return query ? `${PATHS.marketplace}?${query}` : PATHS.marketplace
}

/** Only same-site paths are followed after sign-in (no open redirects such as //evil.example or /\evil). */
export function safeNextPath(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null
}

/** Login URL that returns to `path` after signing in. */
export function loginUrl(path) {
  return `${PATHS.login}?next=${encodeURIComponent(path)}`
}
