/**
 * Chooses where product data comes from.
 *
 * - `npm run dev`: sample (mock) data by default, because the backend product API does not exist yet.
 *   Set VITE_USE_MOCK_DATA=false in .env.local to use the real API instead.
 * - `npm run build`: the real API, unless VITE_USE_MOCK_DATA=true is set explicitly.
 *
 * The value is fixed at build time by vite.config.js, so production builds without mock data do not
 * contain the mock module or its images at all.
 */
export const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

/**
 * Products, categories, listings and saved items (Stage 6.2). Real API unless VITE_USE_MOCK_PRODUCTS=true; by default
 * it follows real sign-in (VITE_AUTH_MODE=backend), so cart, orders and admin may still show sample data meanwhile.
 */
export const USE_MOCK_PRODUCTS = import.meta.env.VITE_USE_MOCK_PRODUCTS === 'true'

/**
 * Cart, checkout, simulated shipping and payments, and orders (Stage 6.3). Real API unless VITE_USE_MOCK_ORDERS=true;
 * by default it follows the product data source.
 */
export const USE_MOCK_ORDERS = import.meta.env.VITE_USE_MOCK_ORDERS === 'true'
