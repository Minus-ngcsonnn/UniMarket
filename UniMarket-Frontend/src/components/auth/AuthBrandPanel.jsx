import authIllustration from '../../assets/images/auth-illustration.png'
import { BRAND_COPY } from '../../constants/brandCopy'
import { CheckCircleIcon, SparklesIcon } from '../icons'
import Logo from '../layout/Logo'

/**
 * Blue brand panel of the Login/Register screens (Figma).
 * - variant "full": left column on desktop (lg and up), with illustration.
 * - variant "compact": short banner above the form on mobile/tablet, so the brand look is kept on small screens.
 */
export default function AuthBrandPanel({ variant = 'full', className = '' }) {
  if (variant === 'compact') {
    return (
      <div className={`flex flex-col gap-4 rounded-2xl bg-primary p-5 text-white sm:p-6 ${className}`}>
        <Logo variant="inverse" />
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide uppercase">
            <SparklesIcon className="size-3.5 text-lime" />
            {BRAND_COPY.eyebrow}
          </p>
          <p className="text-2xl leading-tight tracking-tight sm:text-3xl">
            {BRAND_COPY.headlineLine1} {BRAND_COPY.headlineLine2}
          </p>
        </div>
      </div>
    )
  }

  return (
    <aside className={`flex-col gap-6 overflow-hidden rounded-3xl bg-primary p-11 text-white ${className}`}>
      <Logo variant="inverse" />

      <div className="flex flex-col gap-5 pt-8">
        <p className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <SparklesIcon className="size-4 text-lime" />
          {BRAND_COPY.eyebrow}
        </p>
        <p className="text-5xl leading-[1.05] tracking-tight">
          {BRAND_COPY.headlineLine1}
          <br />
          {BRAND_COPY.headlineLine2}
        </p>
        <p className="max-w-md text-white/85">Buy smart. Sell easy. Make your student budget go further, together.</p>
      </div>

      {/* Illustration includes the "More finds. Less spend." tag. Its background is the brand blue. */}
      <div className="relative min-h-40 flex-1">
        <img
          src={authIllustration}
          alt="Two students exchanging a stack of books. Tag: More finds. Less spend."
          className="absolute inset-0 h-full w-full object-contain object-center"
        />
      </div>

      <div>
        <p className="flex items-center gap-3 text-sm">
          <CheckCircleIcon className="size-5 shrink-0 text-lime" />
          {BRAND_COPY.trustLine}
        </p>
        <p className="mt-6 border-t border-white/20 pt-6 text-xs text-white/70">{BRAND_COPY.madeBy}</p>
      </div>
    </aside>
  )
}
