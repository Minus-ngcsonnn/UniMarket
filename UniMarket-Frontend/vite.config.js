import process from 'node:process'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend URL used by the dev proxy. Override in UniMarket-Frontend/.env.local if needed.
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8080'

  // Sample data: on for `npm run dev`, off for builds, unless VITE_USE_MOCK_DATA says otherwise.
  // The '@…-api-impl' aliases point to the mock APIs or the real APIs, so builds without sample data
  // never include the mock modules or their images.
  const useMockData = env.VITE_USE_MOCK_DATA ? env.VITE_USE_MOCK_DATA === 'true' : command === 'serve'
  const apiImpl = (mockFile, realFile, useMock = useMockData) => fileURLToPath(new URL(useMock ? mockFile : realFile, import.meta.url))
  // Stage 6.2: products, categories, listings and favorites can use the real API while cart, orders and admin still
  // use sample data. VITE_USE_MOCK_PRODUCTS decides; by default real products go with real sign-in (VITE_AUTH_MODE=backend).
  const useMockProducts = env.VITE_USE_MOCK_PRODUCTS
    ? env.VITE_USE_MOCK_PRODUCTS === 'true'
    : env.VITE_AUTH_MODE === 'backend'
      ? false
      : useMockData
  // Stage 6.3: cart, checkout, simulated shipping / payments and orders follow the product data source unless
  // VITE_USE_MOCK_ORDERS says otherwise (a real listing can only be ordered through the real API).
  const useMockOrders = env.VITE_USE_MOCK_ORDERS ? env.VITE_USE_MOCK_ORDERS === 'true' : useMockProducts

  if (command === 'serve') {
    // Make it obvious which backend (and therefore which database) this dev server talks to.
    console.info(
      `[unimarket] /api -> ${backendUrl} | auth mode: ${env.VITE_AUTH_MODE || (useMockData ? 'demo' : 'backend')} | products: ${useMockProducts ? 'sample data' : 'backend'} | orders: ${useMockOrders ? 'sample data' : 'backend'}`,
    )
  }

  const apiProxy = {
    '/api': {
      target: backendUrl,
      changeOrigin: true,
    },
    // Uploaded listing photos (ProductImages.ImageUrl = /media/products/<file>), served by the backend.
    '/media': {
      target: backendUrl,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_USE_MOCK_DATA': JSON.stringify(String(useMockData)),
      'import.meta.env.VITE_USE_MOCK_PRODUCTS': JSON.stringify(String(useMockProducts)),
      'import.meta.env.VITE_USE_MOCK_ORDERS': JSON.stringify(String(useMockOrders)),
    },
    resolve: {
      alias: {
        '@product-api-impl': apiImpl('./src/mocks/mockProductApi.js', './src/services/products/productApi.js', useMockProducts),
        '@order-api-impl': apiImpl('./src/mocks/mockOrderApi.js', './src/services/orders/orderApi.js', useMockOrders),
        '@account-api-impl': apiImpl('./src/mocks/mockAccountApi.js', './src/services/account/accountApi.js'),
        '@admin-api-impl': apiImpl('./src/mocks/mockAdminApi.js', './src/services/admin/adminApi.js'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Forward /api/* to Spring Boot so the browser sees a single origin (no CORS needed).
      proxy: apiProxy,
    },
    preview: {
      port: 4173,
      proxy: apiProxy,
    },
  }
})
