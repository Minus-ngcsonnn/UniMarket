import { Link } from 'react-router'
import heroImage from '../../assets/images/hero-student-essentials.jpg'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { ArrowRightIcon, CheckCircleIcon, GraduationCapIcon, PlusIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import { buttonClasses } from '../ui/buttonClasses'

/**
 * Homepage hero ("Warm Minimal" redesign): message and actions on the warm page background, the
 * student-essentials illustration from the approved design on the right.
 * @param {string} sellTo where "Sell an Item" leads (sign-in first for guests)
 */
export default function HeroSection({ sellTo = PATHS.sell }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="hero-title" className="pt-6 sm:pt-10">
      <PageContainer className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
        <div className="flex flex-col gap-5 sm:gap-6">
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-wide text-primary uppercase sm:text-sm">
            <GraduationCapIcon className="size-5" />
            {t('hero.eyebrow')}
          </p>
          <h1 id="hero-title" className="max-w-xl text-[2.4rem] leading-[1.05] font-extrabold tracking-tight text-ink sm:text-5xl xl:text-[3.6rem]">
            {t('hero.title')}
          </h1>
          <p className="max-w-lg text-base text-ink-muted sm:text-xl">{t('hero.text')}</p>
          <div className="flex flex-col gap-3 min-[420px]:flex-row">
            <Link to={PATHS.marketplace} className={buttonClasses({ size: 'lg', className: 'group h-13 px-6 text-base' })}>
              {t('hero.explore')}
              <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link to={sellTo} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'h-13 px-6 text-base' })}>
              <PlusIcon className="size-5" />
              {t('hero.sell')}
            </Link>
          </div>
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <CheckCircleIcon className="size-4 shrink-0 text-success" />
            {t('hero.trust')}
          </p>
        </div>

        {/* Illustration from the approved design, rebuilt at 2x on the exact page colour (#F7F6F2), so it needs no frame. */}
        <img src={heroImage} alt={t('hero.imageAlt')} width="1448" height="880" className="mx-auto h-auto w-full max-w-[42rem] lg:max-w-none" />
      </PageContainer>
    </section>
  )
}
