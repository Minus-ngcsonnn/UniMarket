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
