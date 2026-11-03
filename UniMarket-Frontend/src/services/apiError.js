/**
 * One error type for every API call, built from the backend's standard error body
 * ({ status, code, message, fieldErrors[] }, see UniMarket-Backend GlobalExceptionHandler) or from a network problem.
 * Pages branch on `code` / `status`, never on raw Axios objects. Stack traces and request details are never shown.
 */
export class ApiError extends Error {
  /**
   * @param {object} init
   * @param {'http'|'network'|'timeout'} init.kind
   * @param {number} [init.status] HTTP status (0 for network / timeout)
   * @param {string} [init.code] backend error code, e.g. EMAIL_ALREADY_REGISTERED
   * @param {string} [init.message] backend message (safe to show) or a generic one
   * @param {{ field: string, message: string }[]} [init.fieldErrors]
   * @param {number} [init.retryAfterSeconds] from a Retry-After header, when present
   */
  constructor({ kind, status = 0, code, message, fieldErrors = [], retryAfterSeconds }) {
    super(message || 'Something went wrong. Please try again.')
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code || (kind === 'http' ? `HTTP_${status}` : kind.toUpperCase())
    this.fieldErrors = fieldErrors
    this.retryAfterSeconds = retryAfterSeconds
  }

  get isNetworkError() {
    return this.kind === 'network' || this.kind === 'timeout'
  }

  /** { field: message } for the first error of each field. */
  fieldErrorMap() {
    return this.fieldErrors.reduce((map, { field, message }) => (field && !map[field] ? { ...map, [field]: message } : map), {})
  }
}

// Gateway errors come from the Vite dev proxy when the backend is not running.
const GATEWAY_STATUSES = [502, 503, 504]

/** Converts an Axios error into an ApiError (no request data, headers or stack traces are kept). */
export function toApiError(error) {
  if (error instanceof ApiError) return error
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return new ApiError({ kind: 'timeout', message: 'The server took too long to answer. Please try again.' })
  }
  const response = error?.response
  if (!response) {
    return new ApiError({ kind: 'network', message: 'Can’t reach UniMarket right now. Check your connection and try again.' })
  }
  const body = response.data && typeof response.data === 'object' ? response.data : {}
  if (GATEWAY_STATUSES.includes(response.status) && !body.code) {
    return new ApiError({ kind: 'network', status: response.status, message: 'Can’t reach UniMarket right now. Please try again in a moment.' })
  }
  const retryAfter = Number(response.headers?.['retry-after'])
  return new ApiError({
    kind: 'http',
    status: response.status,
    code: typeof body.code === 'string' ? body.code : undefined,
    // Backend messages are written for users; anything else (HTML error pages, proxies) is replaced.
    message: typeof body.message === 'string' && body.code ? body.message : defaultMessage(response.status),
    fieldErrors: Array.isArray(body.fieldErrors) ? body.fieldErrors.filter((e) => e && typeof e.field === 'string') : [],
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  })
}

function defaultMessage(status) {
  if (status === 400) return 'Some fields are invalid.'
  if (status === 401) return 'Sign in to continue.'
  if (status === 403) return 'You do not have permission to do this.'
  if (status === 404) return 'The requested resource was not found.'
  if (status === 409) return 'The request conflicts with the current data.'
  if (status === 429) return 'Too many attempts. Please wait and try again later.'
  return 'Something went wrong on our side. Please try again later.'
}
