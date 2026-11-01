import { useState } from 'react'
import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import FaqList from '../../components/content/FaqList'
import { SearchIcon } from '../../components/icons'
import { buttonClasses } from '../../components/ui/buttonClasses'
import EmptyState from '../../components/ui/EmptyState'
import { FAQ_GROUPS } from '../../constants/faq'
import { PATHS } from '../../routes/paths'

/** Help center: searchable questions grouped by topic, with a link to contact support. */
export default function HelpCenterPage() {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const groups = FAQ_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(({ q, a }) => !needle || `${q} ${a}`.toLowerCase().includes(needle)),
  })).filter((group) => group.items.length > 0)

  return (
    <ContentPage
      eyebrow="Help center"
      title="How can we help?"
      intro="Answers to common questions about buying, selling, payments and your account."
      toc={needle ? undefined : FAQ_GROUPS.map(({ id, title }) => ({ id, title }))}
    >
      <div className="relative mb-8 max-w-xl">
        <label htmlFor="help-search" className="sr-only">
          Search help
        </label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-muted" />
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions, e.g. “cancel order”"
          className="h-12 w-full rounded-control border border-line bg-surface pr-4 pl-11 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title={`No answers for “${query.trim()}”`}
          description="Try other words, or ask us directly."
          action={
            <Link to={PATHS.contact} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              Contact us
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className="scroll-mt-36">
              <h2 id={`${group.id}-title`} className="mb-3 text-lg font-bold text-ink">
                {group.title}
              </h2>
              <FaqList items={group.items} />
            </section>
          ))}
        </div>
      )}

      <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-ink">Still need help?</p>
          <p className="mt-1 text-sm text-ink-muted">Send us a message about an order, a listing or your account.</p>
        </div>
        <Link to={PATHS.contact} className={buttonClasses()}>
          Contact us
        </Link>
      </div>
    </ContentPage>
  )
}
