import { ChevronDownIcon } from '../icons'

/**
 * Questions and answers as an accordion (native <details>, so it works with keyboard and screen readers).
 * @param {{ q: string, a: React.ReactNode }[]} items
 */
export default function FaqList({ items }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ q, a }) => (
        <li key={q}>
          <details className="group rounded-card border border-line bg-surface open:border-primary/30 open:shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 font-medium text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDownIcon className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180 group-open:text-primary" />
            </summary>
            <div className="px-4 pb-4 text-sm leading-relaxed text-ink-muted sm:px-5">{a}</div>
          </details>
        </li>
      ))}
    </ul>
  )
}
