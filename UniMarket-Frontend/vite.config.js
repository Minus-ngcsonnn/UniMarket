import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * A missing static image must be a 404, not the SPA's index.html with status 200 (which a browser would report as a
 * broken image only after downloading HTML, and which looks like a successful load to any HTTP check). Applies to
 * `vite` (public/) and `vite preview` (dist/). Production hosting must be configured the same way.
 */
function missingStaticImagesAre404() {
  const guard = (rootDir) => (req, res, next) => {
    const pathname = decodeURIComponent((req.url || '').split('?')[0])
    if (!pathname.startsWith('/images/')) return next()
    const file = path.resolve(rootDir, `.${pathname}`)
    if (file.startsWith(path.resolve(rootDir) + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return next()
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Image not found')
  }
  return {
    name: 'unimarket-missing-static-images-404',
    configureServer(server) {
      server.middlewares.use(guard(server.config.publicDir))
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard(path.resolve(server.config.root, server.config.build.outDir)))
    },
  }
}

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
  // Stage 6.4: admin workspace, reviews, reports, disputes and promotions follow the order data source unless
  // VITE_USE_MOCK_ADMIN says otherwise (they act on real orders and listings).
  const useMockAdmin = env.VITE_USE_MOCK_ADMIN ? env.VITE_USE_MOCK_ADMIN === 'true' : useMockOrders

  if (command === 'serve') {
    // Make it obvious which backend (and therefore which database) this dev server talks to.
    console.info(
      `[unimarket] /api -> ${backendUrl} | auth mode: ${env.VITE_AUTH_MODE || (useMockData ? 'demo' : 'backend')} | products: ${useMockProducts ? 'sample data' : 'backend'} | orders: ${useMockOrders ? 'sample data' : 'backend'} | admin & community: ${useMockAdmin ? 'sample data' : 'backend'}`,
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
    plugins: [react(), tailwindcss(), missingStaticImagesAre404()],
    define: {
      'import.meta.env.VITE_USE_MOCK_DATA': JSON.stringify(String(useMockData)),
      'import.meta.env.VITE_USE_MOCK_PRODUCTS': JSON.stringify(String(useMockProducts)),
      'import.meta.env.VITE_USE_MOCK_ORDERS': JSON.stringify(String(useMockOrders)),
      'import.meta.env.VITE_USE_MOCK_ADMIN': JSON.stringify(String(useMockAdmin)),
    },
    resolve: {
      alias: {
        '@product-api-impl': apiImpl('./src/mocks/mockProductApi.js', './src/services/products/productApi.js', useMockProducts),
        '@order-api-impl': apiImpl('./src/mocks/mockOrderApi.js', './src/services/orders/orderApi.js', useMockOrders),
        '@account-api-impl': apiImpl('./src/mocks/mockAccountApi.js', './src/services/account/accountApi.js', useMockAdmin),
        '@admin-api-impl': apiImpl('./src/mocks/mockAdminApi.js', './src/services/admin/adminApi.js', useMockAdmin),
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
