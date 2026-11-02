import heroImage from '../../assets/images/hero-student-essentials.jpg'
import useTranslation from '../../i18n/useTranslation'
import { CheckCircleIcon, GraduationCapIcon } from '../icons'
import Logo from '../layout/Logo'

const POINTS = ['auth.pointVerified', 'auth.pointPayment', 'auth.pointDelivery']

/**
 * Brand panel of the Sign In / Sign Up screens ("Warm Minimal" redesign): a quiet white card on the
 * warm page background with the same student-essentials illustration as the homepage hero.
 * - variant "full": left column on desktop (lg and up).
 * - variant "compact": short banner above the form on mobile/tablet.
 */
export default function AuthBrandPanel({ variant = 'full', className = '' }) {
  const { t } = useTranslation()

  if (variant === 'compact') {
    return (
      <div className={`flex items-center justify-between gap-4 ${className}`}>
        <Logo />
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <GraduationCapIcon className="size-4" />
          {t('hero.eyebrow')}
        </p>
      </div>
    )
  }

  return (
    <aside className={`flex-col gap-6 overflow-hidden rounded-2xl border border-line bg-surface p-10 ${className}`}>
      <Logo />

      <div className="flex flex-col gap-4 pt-6">
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-wide text-primary uppercase">
          <GraduationCapIcon className="size-5" />
          {t('hero.eyebrow')}
        </p>
        <p className="text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-ink">{t('hero.title')}</p>
        <p className="max-w-md text-ink-muted">{t('hero.text')}</p>
      </div>

      <div className="relative min-h-40 flex-1">
        <img src={heroImage} alt={t('hero.imageAlt')} className="absolute inset-0 h-full w-full object-contain object-center" />
      </div>

      <ul className="flex flex-col gap-2.5 border-t border-line pt-6 text-sm text-ink">
        {POINTS.map((key) => (
          <li key={key} className="flex items-center gap-2.5">
            <CheckCircleIcon className="size-4.5 shrink-0 text-success" />
            {t(key)}
          </li>
        ))}
      </ul>
    </aside>
  )
}
