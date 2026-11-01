import { Link } from 'react-router'
import { ArrowRightIcon } from '../icons'

/**
 * Heading row for a page section: title (+ optional badge and description) and an optional "View all" link.
 * @param {{ label: string, to: string }} [action]
 * @param {Function} [icon] small icon before the title (e.g. a tag for Student Deals)
 */
export default function SectionHeader({ id, title, description, badge, action, icon: Icon }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 sm:mb-5">
      <div>
        <h2 id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-extrabold tracking-tight text-ink sm:text-[1.75rem]">
          {Icon && <Icon className="size-6 text-primary sm:size-7" />}
          {title}
          {badge}
        </h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && (
        <Link to={action.to} className="group inline-flex items-center gap-1 text-sm font-semibold text-primary">
          {action.label}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}
