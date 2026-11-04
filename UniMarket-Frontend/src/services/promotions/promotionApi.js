import apiClient from '../apiClient'

/**
 * Listing promotions ("Featured", docs/ADMIN_API.md §8). Prices and durations come from the server's packages; the
 * request only chooses a package and a (simulated) provider. A promotion is featured only after the server verified the
 * simulated payment — starting one never features the listing.
 */
export const promotionApi = {
  /** GET /api/promotion-packages → [{ id, name, durationHours, price }] (public). */
  async packages() {
    const { data } = await apiClient.get('/promotion-packages')
    return data
  },

  /** GET /api/me/promotions → my promotions (all listings), newest first. */
  async mine() {
    const { data } = await apiClient.get('/me/promotions')
    return data
  },

  /**
   * POST /api/products/{id}/promotions → 201 new / 200 resumed pending one.
   * @returns {Promise<{ id, status, amount, provider, simulatorUrl?, resumed, startsAt, endsAt, sandbox }>}
   */
  async start(productId, packageId, provider) {
    const { data } = await apiClient.post(`/products/${productId}/promotions`, { packageId, provider })
    return data
  },

  /** Sandbox only: finish the simulated payment; the server verifies a signed notification before featuring. */
  async completeSimulated(simulatorUrl, outcome) {
    if (!simulatorUrl?.startsWith('/api/dev/payment-simulator/')) throw new Error('Online payment is unavailable.')
    const { data } = await apiClient.post(simulatorUrl.replace(/^\/api/, ''), { outcome })
    return data
  },
}
