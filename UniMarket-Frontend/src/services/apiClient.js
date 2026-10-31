import axios from 'axios'

/**
 * Shared Axios instance for all UniMarket API calls.
 * Requests use the relative base URL "/api", which the Vite dev server
 * proxies to the Spring Boot backend (see vite.config.js).
 */
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

export default apiClient
