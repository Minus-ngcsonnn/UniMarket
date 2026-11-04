import { Link } from 'react-router'
import CategoryGrid from '../components/home/CategoryGrid'
import HeroSection from '../components/home/HeroSection'
import HomePromotionBanner from '../components/home/HomePromotionBanner'
import HowItWorksSection from '../components/home/HowItWorksSection'
import ListingSection from '../components/home/ListingSection'
import { SparklesIcon, TagIcon } from '../components/icons'
import { buttonClasses } from '../components/ui/buttonClasses'
import { DEAL_MIN_SAVINGS } from '../constants/product'
import useViewer from '../hooks/useViewer'
import useTranslation from '../i18n/useTranslation'
import { PATHS } from '../routes/paths'

// Student Deals use the existing deal rule: at least DEAL_MIN_SAVINGS % below the seller's original price.
const DEALS_QUERY = { deals: true }
const RECENT_QUERY = { sort: 'newest' }
// Listings whose paid promotion is running now (backend `featured`), only public available ones; up to two rows.
const FEATURED_QUERY = { featured: true }
const FEATURED_COUNT = 8

/**
 * Marketplace homepage ("Warm Minimal" redesign), in the approved order:
 * Hero → Explore Categories → Featured Products (only while promotions run) → Student Deals → Recently Listed →
 * How UniMarket Works (footer in the layout).
 */
export default function HomePage() {
  const { t } = useTranslation()
  const { isGuest } = useViewer()
  const sellTo = isGuest ? `${PATHS.login}?next=${encodeURIComponent(PATHS.sell)}` : PATHS.sell

  const freshFindsBadge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium tracking-normal text-success">
      <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
      {t('recent.badge')}
    </span>
  )

  return (
    <>
      <title>UniMarket · Buy & sell within your campus</title>
      {/* Top promotional banner (running paid promotions only); renders nothing when none run. */}
      <HomePromotionBanner />
      <div className="flex flex-col gap-12 pb-14 sm:gap-16 sm:pb-16">
        <HeroSection sellTo={sellTo} />
        <CategoryGrid />
        <ListingSection
          id="featured-title"
          icon={SparklesIcon}
          title={t('featuredHome.title')}
          description={t('featuredHome.description')}
          viewAll={{ label: t('common.viewAll'), to: PATHS.marketplace }}
          query={FEATURED_QUERY}
          pageSize={FEATURED_COUNT}
          hideWhenEmpty
        />
        <ListingSection
          id="deals-title"
          icon={TagIcon}
          title={t('deals.title')}
          description={t('deals.description', { percent: DEAL_MIN_SAVINGS })}
          viewAll={{ label: t('common.viewAll'), to: PATHS.deals }}
          query={DEALS_QUERY}
          emptyTitle={t('deals.emptyTitle')}
          emptyDescription={t('deals.emptyText')}
          emptyAction={
            <Link to={PATHS.marketplace} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-1' })}>
              {t('sections.explore')}
            </Link>
          }
        />
        <ListingSection
          id="recent-title"
          title={t('recent.title')}
          badge={freshFindsBadge}
          description={t('recent.description')}
          viewAll={{ label: t('common.viewAll'), to: PATHS.marketplace }}
          query={RECENT_QUERY}
          emptyTitle={t('recent.emptyTitle')}
          emptyDescription={t('recent.emptyText')}
          emptyAction={
            <Link to={PATHS.marketplace} className="text-sm font-semibold text-primary hover:underline">
              {t('sections.explore')}
            </Link>
          }
        />
        <HowItWorksSection sellTo={sellTo} />
      </div>
    </>
  )
}
