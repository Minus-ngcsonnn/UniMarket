import PageContainer from '../layout/PageContainer'
import SectionHeader from '../layout/SectionHeader'
import { InboxIcon } from '../icons'
import ProductCardSkeleton from '../product/ProductCardSkeleton'

const PLACEHOLDER_CARDS = 4

/**
 * Homepage product section ("Featured Products", "Recently Listed").
 * Listings need the database/API, so for now the section shows outline cards in the Figma grid
 * with a message on top. When listings exist, render real product cards in the same grid instead.
 */
export default function ListingSection({ id, title, description, badge, viewAll, emptyTitle, emptyDescription, emptyAction }) {
  return (
    <section aria-labelledby={id}>
      <PageContainer>
        <SectionHeader id={id} title={title} description={description} badge={badge} action={viewAll} />

        <div className="relative">
          <ul className="grid grid-cols-2 gap-3 opacity-80 sm:gap-4 lg:grid-cols-4" aria-hidden="true">
            {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
              // Mobile/tablet show 2 outlines, desktop shows the full row of 4.
              <li key={index} className={index >= 2 ? 'hidden lg:block' : ''}>
                <ProductCardSkeleton />
              </li>
            ))}
          </ul>

          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-line bg-surface/95 px-6 py-6 text-center shadow-lg shadow-ink/5 backdrop-blur-sm">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                <InboxIcon className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-ink">{emptyTitle}</p>
                <p className="text-sm text-ink-muted">{emptyDescription}</p>
              </div>
              {emptyAction}
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  )
}
