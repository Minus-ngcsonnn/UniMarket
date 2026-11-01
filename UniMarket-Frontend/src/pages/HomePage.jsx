import { Link } from 'react-router'
import CategoryGrid from '../components/home/CategoryGrid'
import HeroSection from '../components/home/HeroSection'
import ListingSection from '../components/home/ListingSection'
import SellCallout from '../components/home/SellCallout'
import TrustHighlights from '../components/home/TrustHighlights'
import { buttonClasses } from '../components/ui/buttonClasses'
import { PATHS } from '../routes/paths'

const freshFindsBadge = (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-xs font-medium tracking-normal text-success">
    <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
    Fresh finds
  </span>
)

const FEATURED_QUERY = { featured: true }
const RECENT_QUERY = { sort: 'newest' }

/** Marketplace homepage (Figma "Homepage"). Product sections show empty states when there are no listings. */
export default function HomePage() {
  return (
    <>
      <title>UniMarket · Buy & sell with your campus</title>
      <div className="flex flex-col gap-10 pb-12 sm:gap-14 sm:pb-14">
        <HeroSection />
        <CategoryGrid />
        <ListingSection
          id="featured-title"
          title="Featured Products"
          description="Great deals worth a study break. Handpicked for your campus life."
          viewAll={{ label: 'View all featured', to: PATHS.marketplace }}
          query={FEATURED_QUERY}
          emptyTitle="No featured products yet"
          emptyDescription="Handpicked deals will appear here once students start listing items."
          emptyAction={
            <Link to={PATHS.sell} className={buttonClasses({ size: 'sm', className: 'mt-1' })}>
              Sell an item
            </Link>
          }
        />
        <ListingSection
          id="recent-title"
          title="Recently Listed"
          badge={freshFindsBadge}
          description="Just landed on campus. Find your next favorite before someone else does."
          viewAll={{ label: 'View all listings', to: PATHS.marketplace }}
          query={RECENT_QUERY}
          emptyTitle="No listings yet"
          emptyDescription="New items from your campus will show up here as soon as they are posted."
          emptyAction={
            <Link to={PATHS.marketplace} className="text-sm font-semibold text-primary hover:underline">
              Explore the marketplace
            </Link>
          }
        />
        <SellCallout />
        <TrustHighlights />
      </div>
    </>
  )
}
