import apiClient from '../apiClient'

/**
 * Buyer / seller chat (backend V004, /api/conversations). Real API only: there is no sample-data version.
 * Message bodies are plain text from students and are rendered by React as text, never as HTML.
 * New messages are fetched by polling (GET .../messages?after=<last id>); there is no push channel.
 */

const data = (request) => request.then((response) => response.data)

export const chatApi = {
  /** Opens the conversation about a listing (or returns the existing one). */
  start: (productId) => data(apiClient.post('/conversations', { productId: Number(productId) })),
  /** My conversations, newest activity first. */
  list: () => data(apiClient.get('/conversations')),
  /** Unread messages over all my conversations. */
  unreadCount: () => data(apiClient.get('/conversations/unread-count')).then((body) => body.count ?? 0),
  get: (id) => data(apiClient.get(`/conversations/${id}`)),
  /** Ascending. `after`: newer than this id; otherwise the newest `limit`, or older than `before`. */
  messages: (id, { after, before, limit } = {}) =>
    data(apiClient.get(`/conversations/${id}/messages`, { params: Object.fromEntries(Object.entries({ after, before, limit }).filter(([, v]) => v != null)) })),
  send: (id, body) => data(apiClient.post(`/conversations/${id}/messages`, { body })),
  markRead: (id) => data(apiClient.post(`/conversations/${id}/read`)),
}

/** Most messages in one request (backend limit). */
export const CHAT_PAGE_SIZE = 50
/** Longest message (backend limit). */
export const CHAT_MESSAGE_MAX = 2000

const listeners = new Set()

/** Subscribe to "chat data changed here" (a message was sent or read), e.g. to refresh the header badge. */
export function onChatChanged(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyChatChanged() {
  listeners.forEach((listener) => listener())
}

/** Backend refusals → text for the student. */
export function chatErrorText(error) {
  switch (error?.code) {
    case 'CHAT_NOT_ALLOWED':
    case 'CHAT_UNAVAILABLE':
    case 'TOO_MANY_ATTEMPTS':
      return error.message
    case 'VALIDATION_FAILED':
      return `Messages must be 1 to ${CHAT_MESSAGE_MAX} characters.`
    case 'NOT_FOUND':
      return 'This conversation doesn’t exist or isn’t yours.'
    default:
      return error?.message ?? 'Something went wrong. Please try again.'
  }
}

/**
 * Long digit sequences (bank accounts, phone numbers) in a message from the other person: the page shows a reminder
 * that UniMarket orders are paid online through UniMarket only.
 */
export const looksLikePaymentDetails = (text) => /\d[\d .-]{7,}\d/.test(text ?? '')
