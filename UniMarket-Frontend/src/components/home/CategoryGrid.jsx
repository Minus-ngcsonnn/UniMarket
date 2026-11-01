import { Link } from 'react-router'
import { CATEGORIES } from '../../constants/categories'
import { marketplaceUrl, PATHS } from '../../routes/paths'
import PageContainer from '../layout/PageContainer'
import SectionHeader from '../layout/SectionHeader'

/**
 * "What's on your list?" category shortcuts (Figma).
 * Desktop: one row of 5 cards. Mobile/tablet: the same cards in a horizontal swipe row,
 * so the card design is kept instead of becoming a long vertical list.
 */
export default function CategoryGrid() {
  return (
    <section aria-labelledby="categories-title">
      <PageContainer>
        <SectionHeader
          id="categories-title"
          title="What’s on your list?"
          action={{ label: 'Browse all categories', to: PATHS.marketplace }}
        />
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0 lg:pt-0 lg:pb-0">
          {CATEGORIES.map(({ slug, name, tagline, Icon }) => (
            <li key={slug} className="w-56 shrink-0 snap-start lg:w-auto">
              <Link
                to={marketplaceUrl({ category: slug })}
                className="group flex h-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 active:translate-y-0"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{name}</span>
                  <span className="block text-[11px] leading-4 text-ink-muted">{tagline}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  )
}
