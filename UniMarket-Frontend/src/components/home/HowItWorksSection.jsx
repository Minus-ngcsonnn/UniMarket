import { Link } from 'react-router'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { ArrowRightIcon, PlusIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import SectionHeader from '../layout/SectionHeader'
import { buttonClasses } from '../ui/buttonClasses'

/**
 * "How UniMarket Works": the Business Plan order flow in four short steps (find → seller confirms →
 * pay online → confirm and review), plus a small sell prompt. No illustrations, just readable text.
 * @param {string} sellTo where "Sell an Item" leads (sign-in first for guests)
 */
export default function HowItWorksSection({ sellTo = PATHS.sell }) {
  const { t } = useTranslation()
  const steps = t('howItWorks.steps')

  return (
    <section aria-labelledby="how-title">
      <PageContainer>
        <SectionHeader
          id="how-title"
          title={t('howItWorks.title')}
          description={t('howItWorks.description')}
          action={{ label: t('howItWorks.learnMore'), to: PATHS.howItWorks }}
        />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="font-semibold text-ink">{step.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{step.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink">{t('howItWorks.sellTitle')}</p>
            <p className="text-sm text-ink-muted">{t('howItWorks.sellText')}</p>
          </div>
          <Link to={sellTo} className={buttonClasses({ className: 'group shrink-0' })}>
            <PlusIcon className="size-4" />
            {t('hero.sell')}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </PageContainer>
    </section>
  )
}
