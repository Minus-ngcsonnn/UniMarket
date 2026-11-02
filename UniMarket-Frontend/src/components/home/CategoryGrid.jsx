import { Link } from 'react-router'
import dormItems from '../../assets/categories/dorm-items.jpg'
import electronics from '../../assets/categories/electronics.jpg'
import fashion from '../../assets/categories/fashion.jpg'
import studyGear from '../../assets/categories/study-gear.jpg'
import textbooks from '../../assets/categories/textbooks.jpg'
import { CATEGORIES } from '../../constants/categories'
import useTranslation from '../../i18n/useTranslation'
import { marketplaceUrl, PATHS } from '../../routes/paths'
import { LayoutDashboardIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import SectionHeader from '../layout/SectionHeader'

/** Photo per category (product shots from the UniMarket Figma file). */
const CATEGORY_IMAGES = { textbooks, electronics, 'dorm-items': dormItems, fashion, 'study-gear': studyGear }

const cardClass =
  'group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-pop'

/**
 * "Explore Categories" (approved redesign): the 5 marketplace categories as photo cards plus "All items".
 * Each card opens the marketplace filtered by that category. Mobile: a horizontal swipe row.
 */
export default function CategoryGrid() {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="categories-title">
      <PageContainer>
        <SectionHeader id="categories-title" title={t('categories.title')} action={{ label: t('common.viewAll'), to: PATHS.marketplace }} />
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pt-0 lg:pb-0">
          {CATEGORIES.map(({ slug }) => (
            <li key={slug} className="w-36 shrink-0 snap-start sm:w-40 lg:w-auto">
              <Link to={marketplaceUrl({ category: slug })} className={cardClass}>
                <span className="block aspect-[4/3] overflow-hidden bg-subtle">
                  <img src={CATEGORY_IMAGES[slug]} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                </span>
                <span className="px-3 py-2.5 text-sm font-semibold text-ink">{t(`categories.${slug}`)}</span>
              </Link>
            </li>
          ))}
          <li className="w-36 shrink-0 snap-start sm:w-40 lg:w-auto">
            <Link to={PATHS.marketplace} className={cardClass}>
              <span className="flex aspect-[4/3] items-center justify-center bg-primary-soft text-primary">
                <LayoutDashboardIcon className="size-8" />
              </span>
              <span className="px-3 py-2.5 text-sm font-semibold text-ink">
                {t('categories.all')}
                <span className="block text-[11px] font-normal text-ink-muted">{t('categories.allHint')}</span>
              </span>
            </Link>
          </li>
        </ul>
      </PageContainer>
    </section>
  )
}
