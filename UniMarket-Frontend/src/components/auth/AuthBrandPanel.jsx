import illustration from '../../assets/images/auth-campus-essentials.webp'
import useTranslation from '../../i18n/useTranslation'
import { CheckCircleIcon, GraduationCapIcon } from '../icons'
import Logo from '../layout/Logo'

const POINTS = ['auth.pointVerified', 'auth.pointPayment', 'auth.pointDelivery']

/** Community label shown as a soft blue pill. */
function Eyebrow({ className = '' }) {
  const { t } = useTranslation()
  return (
    <p className={`inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary ${className}`}>
      <GraduationCapIcon className="size-4.5 shrink-0" />
      {t('auth.eyebrow')}
    </p>
  )
}

/**
 * Brand panel of the Sign In / Sign Up screens (approved Nov 2026 design): the left column of the shared auth card,
 * light-blue gradient with soft shapes, the campus-essentials illustration (desk lamp, UniMarket tote, notebooks,
 * tablet, plant) and the three marketplace promises.
 * - variant "full": left column on desktop (lg and up).
 * - variant "compact": short brand header on top of the card on mobile / tablet (no illustration).
 */
export default function AuthBrandPanel({ variant = 'full', className = '' }) {
  const { t } = useTranslation()

  if (variant === 'compact') {
    return (
      <div className={`relative overflow-hidden bg-linear-to-br from-primary-soft to-surface px-6 pt-6 pb-5 sm:px-10 sm:pt-8 ${className}`}>
        <span aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <Eyebrow className="text-xs sm:text-sm" />
        </div>
      </div>
    )
  }

  return (
    <aside className={`relative isolate overflow-clip bg-linear-to-br from-primary-soft via-primary-soft/70 to-surface ${className}`}>
      {/* Decorative soft shapes (purely visual). */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-24 right-[-4rem] -z-10 size-80 rounded-full bg-primary/10 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-[-6rem] left-[-5rem] -z-10 size-72 rounded-full bg-primary/10 blur-3xl" />

      <div className="flex flex-col gap-7 p-10 lg:sticky lg:top-0 xl:p-14">
        <Logo />

        <div className="flex flex-col gap-4">
          <Eyebrow />
          <p className="text-[2.25rem] leading-[1.1] font-extrabold tracking-tight text-balance text-ink xl:text-[2.6rem]">
            {t('auth.title')}
          </p>
          <p className="max-w-md text-lg text-ink-muted">{t('auth.text')}</p>
        </div>

        <div className="relative flex min-h-44 flex-1 items-center justify-center">
          <span aria-hidden="true" className="absolute inset-x-6 top-1/2 -z-10 h-3/4 -translate-y-1/2 rounded-[45%] bg-primary/10 blur-xl" />
          <img
            src={illustration}
            alt={t('auth.imageAlt')}
            width="598"
            height="284"
            className="h-auto max-h-72 w-full object-contain"
          />
        </div>

        <ul className="flex flex-col gap-3 text-[0.95rem] text-ink">
          {POINTS.map((key) => (
            <li key={key} className="flex items-center gap-3">
              <CheckCircleIcon className="size-5 shrink-0 text-primary" />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
