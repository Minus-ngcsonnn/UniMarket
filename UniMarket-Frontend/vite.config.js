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
  const apiImpl = (mockFile, realFile) => fileURLToPath(new URL(useMockData ? mockFile : realFile, import.meta.url))

  const apiProxy = {
    '/api': {
      target: backendUrl,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_USE_MOCK_DATA': JSON.stringify(String(useMockData)),
    },
    resolve: {
      alias: {
        '@product-api-impl': apiImpl('./src/mocks/mockProductApi.js', './src/services/products/productApi.js'),
        '@order-api-impl': apiImpl('./src/mocks/mockOrderApi.js', './src/services/orders/orderApi.js'),
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
