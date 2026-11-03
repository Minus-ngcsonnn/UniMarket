import { hasMinLength, isBlank, isValidEmail } from './validators'

/**
 * Client-side validation rules for the Login and Register forms.
 * Each function returns { fieldName: message } for invalid fields only.
 * The backend must apply its own validation once it exists.
 */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_RULE_TEXT = 'Use 8+ characters, including a letter and a number.'

function validateEmail(email) {
  if (isBlank(email)) return 'Email address is required.'
  if (!isValidEmail(email)) return 'Enter a valid email address, e.g. you@example.com.'
  return undefined
}

function withoutEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message))
}

export function validateLogin({ email, password }) {
  return withoutEmpty({
    email: validateEmail(email),
    password: isBlank(password) ? 'Password is required.' : undefined,
  })
}

/**
 * Any valid email address is accepted (nationwide registration, Nov 2026): no university-domain rule.
 * @param {object} values form values
 */
export function validateRegister({ fullName, email, password, confirmPassword, acceptTerms }) {
  let passwordError
  if (isBlank(password)) passwordError = 'Password is required.'
  else if (!hasMinLength(password, PASSWORD_MIN_LENGTH) || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    passwordError = PASSWORD_RULE_TEXT
  }

  let confirmError
  if (isBlank(confirmPassword)) confirmError = 'Please repeat your password.'
  else if (confirmPassword !== password) confirmError = 'Passwords do not match.'

  return withoutEmpty({
    fullName: isBlank(fullName)
      ? 'Full name is required.'
      : !hasMinLength(fullName.trim(), 2)
        ? 'Enter your full name.'
        : undefined,
    email: validateEmail(email),
    password: passwordError,
    confirmPassword: confirmError,
    acceptTerms: acceptTerms ? undefined : 'Please accept the Terms of service and Privacy policy.',
  })
}
