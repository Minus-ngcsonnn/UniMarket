import { Link } from 'react-router'
import { ChevronRightIcon } from '../icons'

/**
 * Breadcrumb trail (Figma catalog: "Home > Explore marketplace").
 * @param {{ label: string, to?: string }[]} items the last item is the current page (no link)
 */
export default function Breadcrumbs({ items, className = '' }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 && <ChevronRightIcon className="size-3.5 shrink-0 text-ink-muted" />}
              {isCurrent || !item.to ? (
                <span aria-current={isCurrent ? 'page' : undefined} className="truncate text-ink">
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="text-ink-muted transition-colors hover:text-primary">
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
