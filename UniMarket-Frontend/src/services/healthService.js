import apiClient from './apiClient'

/**
 * Calls GET /api/health.
 * @returns {Promise<{status: string, application: string}>}
 */
export async function getHealth() {
  const response = await apiClient.get('/health')
  return response.data
}
