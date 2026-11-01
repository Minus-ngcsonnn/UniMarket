import { Link } from 'react-router'
import { GraduationCapIcon } from '../icons'
import { buttonClasses } from '../ui/buttonClasses'

const LABEL = 'Sign up with University Email (.edu.vn)'

/**
 * "Sign up with University Email (.edu.vn)" (Figma).
 * - With `to`: a link (Login page -> Register page in university-email mode).
 * - With `onClick`: a toggle button (Register page switches the email field to university email).
 */
export default function UniversityEmailButton({ to, onClick, pressed = false }) {
  const className = buttonClasses({
    variant: pressed ? 'selected' : 'secondary',
    size: 'lg',
    fullWidth: true,
    className: 'text-primary',
  })
  const content = (
    <>
      <GraduationCapIcon className="size-5" />
      {LABEL}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={className}>
      {content}
    </button>
  )
}
