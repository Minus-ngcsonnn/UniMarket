import apiClient from '../apiClient'

/**
 * UniMarket authentication API (UniMarket-Backend/docs/AUTH_API.md). Every function rejects with an ApiError.
 * Request and response bodies are never logged (they contain passwords, codes and tokens).
 */
export const authApi = {
  /**
   * POST /api/auth/register → 201 { user, verificationRequired, codeExpiresAt }.
   * Exactly one of campusId / universityName must be set (the caller guarantees it).
   * @param {{ fullName: string, email: string, password: string, campusId?: number, universityName?: string, homeZoneId?: number }} body
   */
  async register(body) {
    const { data } = await apiClient.post('/auth/register', body)
    return data
  },

  /** POST /api/auth/verify-email → 200 { message } */
  async verifyEmail(email, code) {
    const { data } = await apiClient.post('/auth/verify-email', { email, code })
    return data
  },

  /** POST /api/auth/resend-verification → 202 { message } (same answer whether or not a code was sent) */
  async resendVerification(email) {
    const { data } = await apiClient.post('/auth/resend-verification', { email })
    return data
  },

  /** POST /api/auth/login → 200 { accessToken, tokenType, expiresIn, expiresAt, user } */
  async login(email, password) {
    const { data } = await apiClient.post('/auth/login', { email, password })
    return data
  },

  /**
   * GET /api/auth/me with an explicit token (used right after login, before the session stores it).
   * Without `token` the session token is used.
   */
  async me(token) {
    const { data } = await apiClient.get('/auth/me', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    return data
  },
}

/** Public reference data used by the registration form. */
export const referenceApi = {
  /** GET /api/campuses → [{ id, name, universityId, university }] */
  async campuses() {
    const { data } = await apiClient.get('/campuses')
    return data
  },

  /** GET /api/locations/zones → [{ id, code, name, province }] (V003 demo areas, no coordinates) */
  async zones() {
    const { data } = await apiClient.get('/locations/zones')
    return data
  },

  /**
   * GET /api/users/{id} → public profile with rating summary and active listings (students only; 404 otherwise).
   */
  async publicProfile(userId) {
    const { data } = await apiClient.get(`/users/${userId}`)
    return data
  },
}
