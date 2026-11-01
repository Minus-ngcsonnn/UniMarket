/**
 * Every URL used by the app, in one place. Use these instead of hard-coded strings.
 * Paths without a page yet fall through to the "not available yet" page (see App.jsx).
 */
export const PATHS = {
  home: '/',
  login: '/login',
  register: '/register',

  // Planned pages (not implemented yet)
  marketplace: '/marketplace',
  deals: '/deals',
  sell: '/sell',
  messages: '/messages',
  cart: '/cart',
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
