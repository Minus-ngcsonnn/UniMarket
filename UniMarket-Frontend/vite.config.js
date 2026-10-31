import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend URL used by the dev proxy. Override in UniMarket-Frontend/.env.local if needed.
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8080'

  const apiProxy = {
    '/api': {
      target: backendUrl,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react()],
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
