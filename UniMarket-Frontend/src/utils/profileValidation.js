import { CAMPUS_KEYS } from '../constants/product'

export const PROFILE_LIMITS = { name: 60, programme: 80, bio: 300 }

/** Profile form rules (the backend must check them again). */
export function validateProfile({ name, programme, campus, bio }) {
  const errors = {}
  const trimmedName = name.trim()
  if (!trimmedName) errors.name = 'Enter your name.'
  else if (trimmedName.length < 2) errors.name = 'Your name needs at least 2 characters.'
  else if (trimmedName.length > PROFILE_LIMITS.name) errors.name = `Keep your name under ${PROFILE_LIMITS.name} characters.`
  else if (/[0-9@]/.test(trimmedName)) errors.name = 'Use your name only, without numbers or email addresses.'
  if (programme.trim().length > PROFILE_LIMITS.programme) errors.programme = `Keep this under ${PROFILE_LIMITS.programme} characters.`
  if (!CAMPUS_KEYS.includes(campus)) errors.campus = 'Choose your campus.'
  if (bio.trim().length > PROFILE_LIMITS.bio) errors.bio = `Keep this under ${PROFILE_LIMITS.bio} characters.`
  else if (/(\+?84|0)\d{9}\b/.test(bio.replace(/[\s.-]/g, ''))) errors.bio = 'Remove phone numbers. Students contact you through UniMarket.'
  return errors
}
