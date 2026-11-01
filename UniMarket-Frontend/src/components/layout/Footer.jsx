import { Link } from 'react-router'
import { BRAND_COPY } from '../../constants/brandCopy'
import { PATHS } from '../../routes/paths'
import Logo from './Logo'
import PageContainer from './PageContainer'

const FOOTER_COLUMNS = [
  {
    title: 'Marketplace',
    links: [
      { label: 'Explore all listings', to: PATHS.marketplace },
      { label: 'Student deals', to: PATHS.deals },
      { label: 'Sell an item', to: PATHS.sell },
    ],
  },
  {
    title: 'UniMarket',
    links: [
      { label: 'About us', to: PATHS.about },
      { label: 'How it works', to: PATHS.howItWorks },
      { label: 'Campus ambassadors', to: PATHS.ambassadors },
    ],
  },
  {
    title: 'Here to help',
    links: [
      { label: 'Help center', to: PATHS.help },
      { label: 'Safety & trust', to: PATHS.safety },
      { label: 'Contact us', to: PATHS.contact },
    ],
  },
]

const linkClasses = 'text-white/70 transition-colors hover:text-white'

/**
 * Site footer from the Figma design (catalog page version).
 * Social icons from Figma are omitted until real account URLs are available.
 */
export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-navy text-white">
      <PageContainer className="py-10 sm:py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Logo variant="inverse" />
            <p className="mt-4 text-sm text-white/70">
              {BRAND_COPY.footerTagline[0]}
              <br />
              {BRAND_COPY.footerTagline[1]}
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-medium">{column.title}</h2>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className={linkClasses}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/15 pt-6 text-xs text-white/60 lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {year} UniMarket. {BRAND_COPY.madeBy}
          </p>
          <p>*Compared with original retail prices. Prices set by sellers.</p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link to={PATHS.privacy} className={linkClasses}>
              Privacy policy
            </Link>
            <Link to={PATHS.terms} className={linkClasses}>
              Terms of service
            </Link>
          </nav>
        </div>
      </PageContainer>
    </footer>
  )
}
