import { hasMinLength, isBlank, isValidEmail } from './validators'

/**
 * Client-side validation rules for the Login and Register forms, aligned with the backend DTOs
 * (RegisterRequest, LoginRequest, VerifyEmailRequest). Each function returns { fieldName: message } for invalid
 * fields only. The backend validates everything again; its field errors are shown when it disagrees.
 */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72
export const PASSWORD_RULE_TEXT = 'Use 8+ characters, including a letter and a number.'
export const FULL_NAME_MAX_LENGTH = 150
export const EMAIL_MAX_LENGTH = 254
export const UNIVERSITY_NAME_MIN_LENGTH = 2
export const UNIVERSITY_NAME_MAX_LENGTH = 200
export const OTP_LENGTH = 6

/**
 * Affiliation choices of the registration form (V003): exactly one is sent.
 * CAMPUS → campusId; DIRECTORY (Ministry-sourced list) and UNIVERSITY (typed by hand) → universityName.
 */
export const AFFILIATION = { CAMPUS: 'campus', DIRECTORY: 'directory', UNIVERSITY: 'university' }

/** Trimmed, inner whitespace collapsed — the same normalisation as the backend. */
export function normalizeUniversityName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function validateEmail(email) {
  if (isBlank(email)) return 'Email address is required.'
  if (String(email).trim().length > EMAIL_MAX_LENGTH) return 'Use at most {count} characters.'.replace('{count}', EMAIL_MAX_LENGTH)
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

function validatePassword(password) {
  if (isBlank(password)) return 'Password is required.'
  if (!hasMinLength(password, PASSWORD_MIN_LENGTH) || !/\p{L}/u.test(password) || !/\d/.test(password)) return PASSWORD_RULE_TEXT
  // The backend hashes at most 72 bytes (BCrypt); accented letters take more than one byte.
  if (password.length > PASSWORD_MAX_LENGTH || new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) {
    return 'Use at most 72 characters (accented letters count as more).'
  }
  return undefined
}

/**
 * Registration (nationwide, V003): any valid email address; exactly one affiliation — an official campus OR a
 * university / college name typed by the student (self-declared, not verified). Home area is optional.
 * @param {object} values form values
 * @param {{ requireAffiliation?: boolean }} [options] false in the offline demo (no affiliation fields shown)
 */
export function validateRegister(
  { fullName, email, password, confirmPassword, affiliationType, campusId, universityName, acceptTerms },
  { requireAffiliation = true } = {},
) {
  let confirmError
  if (isBlank(confirmPassword)) confirmError = 'Please repeat your password.'
  else if (confirmPassword !== password) confirmError = 'Passwords do not match.'

  const name = String(fullName ?? '').trim()
  const university = normalizeUniversityName(universityName)

  return withoutEmpty({
    fullName: !name
      ? 'Full name is required.'
      : !hasMinLength(name, 2)
        ? 'Enter your full name.'
        : name.length > FULL_NAME_MAX_LENGTH
          ? 'Use at most 150 characters.'
          : undefined,
    email: validateEmail(email),
    password: validatePassword(password),
    confirmPassword: confirmError,
    affiliationType: !requireAffiliation || affiliationType ? undefined : 'Choose your university, academy or college, or type its name.',
    campusId: affiliationType === AFFILIATION.CAMPUS && !campusId ? 'Choose your campus.' : undefined,
    universityName:
      affiliationType !== AFFILIATION.UNIVERSITY && affiliationType !== AFFILIATION.DIRECTORY
        ? undefined
        : university.length < UNIVERSITY_NAME_MIN_LENGTH
          ? 'Type the name of your university or college (at least 2 characters).'
          : university.length > UNIVERSITY_NAME_MAX_LENGTH
            ? 'Use at most 200 characters.'
            : undefined,
    acceptTerms: acceptTerms ? undefined : 'Please accept the Terms of service and Privacy policy.',
  })
}

/**
 * Request body for POST /api/auth/register: exactly one of campusId / universityName, never both;
 * homeZoneId only when chosen. The confirmation and terms fields stay in the browser.
 */
export function toRegisterRequest(values) {
  const body = {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    password: values.password,
  }
  if (values.affiliationType === AFFILIATION.CAMPUS) body.campusId = Number(values.campusId)
  else body.universityName = normalizeUniversityName(values.universityName)
  if (values.homeZoneId) body.homeZoneId = Number(values.homeZoneId)
  return body
}

/** Backend field names → form field names (validation errors from POST /api/auth/register). */
export const REGISTER_FIELD_MAP = {
  fullName: 'fullName',
  email: 'email',
  password: 'password',
  campusId: 'campusId',
  universityName: 'universityName',
  universityNameLongEnough: 'universityName',
  affiliationProvided: 'affiliationType',
  homeZoneId: 'homeZoneId',
}

export function validateOtp(code) {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code) ? undefined : 'Enter the {count}-digit code from your email.'.replace('{count}', OTP_LENGTH)
}
