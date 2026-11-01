/**
 * Small, reusable checks for client-side form validation.
 * Pages combine them into a validate(values) function that returns { fieldName: 'message' }.
 * Client-side validation only improves UX; the backend must validate again.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when the value is empty or whitespace only. */
export function isBlank(value) {
  return value == null || String(value).trim() === ''
}

/** True for a syntactically valid e-mail address (format check only). */
export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value).trim())
}

/** True when the value has at least `min` characters. */
export function hasMinLength(value, min) {
  return String(value ?? '').length >= min
}
