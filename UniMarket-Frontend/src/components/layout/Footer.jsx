import { Link } from 'react-router'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import Logo from './Logo'
import PageContainer from './PageContainer'

const FOOTER_COLUMNS = [
  {
    title: 'footer.marketplace',
    links: [
      { label: 'footer.allListings', to: PATHS.marketplace },
      { label: 'footer.deals', to: PATHS.deals },
      { label: 'footer.sell', to: PATHS.sell },
      { label: 'footer.myListings', to: PATHS.myListings },
    ],
  },
  {
    title: 'footer.company',
    links: [
      { label: 'footer.about', to: PATHS.about },
      { label: 'footer.howItWorks', to: PATHS.howItWorks },
      { label: 'footer.ambassadors', to: PATHS.ambassadors },
    ],
  },
  {
    title: 'footer.help',
    links: [
      { label: 'footer.helpCenter', to: PATHS.help },
      { label: 'footer.safety', to: PATHS.safety },
      { label: 'footer.contact', to: PATHS.contact },
    ],
  },
]

const linkClasses = 'inline-block py-0.5 text-ink-muted transition-colors hover:text-primary'

/**
 * Site footer ("Warm Minimal" redesign): light surface with a top border instead of a dark blue block.
 * Social icons from Figma are omitted until real account URLs are available.
 */
export default function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line bg-surface">
      <PageContainer className="py-10 sm:py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-ink-muted">{t('footer.tagline')}</p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={t(column.title)}>
              <h2 className="text-sm font-semibold text-ink">{t(column.title)}</h2>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className={linkClasses}>
                      {t(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-muted lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {year} UniMarket. {t('footer.madeBy')}
          </p>
          <p>{t('footer.priceNote')}</p>
          <nav aria-label={t('footer.legal')} className="flex gap-5">
            <Link to={PATHS.privacy} className={linkClasses}>
              {t('footer.privacy')}
            </Link>
            <Link to={PATHS.terms} className={linkClasses}>
              {t('footer.terms')}
            </Link>
          </nav>
        </div>
      </PageContainer>
    </footer>
  )
}
