/**
 * User-facing text for an ApiError (services/apiError.js). English source text, translated with t() by callers.
 * Backend messages are already written for users; network problems, rate limits and server errors get
 * generic wording. Never shows stack traces, SQL or request details.
 * @param {import('../services/apiError').ApiError} error
 * @returns {{ title: string, message: string }}
 */
export function describeApiError(error) {
  if (!error) return { title: 'Something went wrong', message: 'Please try again.' }
  if (error.kind === 'timeout') return { title: 'The server is taking too long', message: 'Please try again in a moment.' }
  if (error.isNetworkError) {
    return { title: 'Can’t reach UniMarket', message: 'The UniMarket server isn’t answering. Check your connection, then try again.' }
  }
  if (error.status === 429) {
    return { title: 'Too many attempts', message: error.message || 'Please wait a few minutes and try again.' }
  }
  if (error.status >= 500) {
    return { title: 'Something went wrong on our side', message: 'Please try again later. Your data was not changed.' }
  }
  return { title: 'Couldn’t complete the request', message: error.message }
}
