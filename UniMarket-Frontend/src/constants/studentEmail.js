/**
 * Registration email rules (team decision Q1, Nov 2026):
 * - Students may register with any email address OR their university email.
 * - Every account is verified with a 6-digit code (OTP) sent to that email.
 * - "Sign up with University Email" switches the form to university-email mode, which only accepts the domains below.
 * Pilot: FPT University. Add more domains here when other universities join.
 */
export const STUDENT_EMAIL_DOMAINS = ['fpt.edu.vn']

export const STUDENT_EMAIL_PLACEHOLDER = `you@${STUDENT_EMAIL_DOMAINS[0]}`

/** True when the address belongs to an accepted university domain (case-insensitive). */
export function isStudentEmail(email) {
  const domain = String(email).trim().toLowerCase().split('@')[1]
  return STUDENT_EMAIL_DOMAINS.includes(domain)
}
