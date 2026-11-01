import { Link } from 'react-router'
import heroImage from '../../assets/images/hero-campus-essentials.jpg'
import { BRAND_COPY } from '../../constants/brandCopy'
import { PATHS } from '../../routes/paths'
import { ArrowRightIcon, CheckCircleIcon, SparklesIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import ImageSlot from '../ui/ImageSlot'

/**
 * Homepage hero (Figma): blue message panel + product photo.
 * The "up to 70%" sticker and "New semester" label are part of the exported image.
 * Mobile: the photo sits under the text at its natural aspect ratio so nothing is cropped.
 */
export default function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="pt-4 sm:pt-8">
      <PageContainer>
        <div className="grid overflow-hidden rounded-3xl bg-primary lg:grid-cols-[1fr_1.07fr]">
          <div className="flex flex-col gap-4 p-6 text-white sm:gap-6 sm:p-12">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium tracking-wide uppercase sm:text-xs">
              <SparklesIcon className="size-3.5 text-lime" />
              {BRAND_COPY.eyebrow}
            </p>

            <h1 id="hero-title" className="text-[2.25rem] leading-[1.05] tracking-tight sm:text-5xl xl:text-[3.5rem]">
              {BRAND_COPY.headlineLine1}
              <br />
              {BRAND_COPY.headlineLine2}
            </h1>

            <p className="max-w-md text-[15px] text-white/85 sm:text-lg">
              Your next great find is right around campus. Shop pre-loved favorites from students like you.
            </p>

            <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center min-[420px]:gap-x-6">
              <Link
                to={PATHS.marketplace}
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-control bg-white px-5 text-sm font-semibold text-primary shadow-sm transition-[background-color,transform] duration-150 hover:bg-primary-soft active:translate-y-px"
              >
                Explore student deals
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to={PATHS.sell} className="group inline-flex items-center justify-center gap-1 text-sm font-semibold">
                Or, sell something
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <p className="flex items-start gap-2 text-sm text-white/85">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-lime" />
              {BRAND_COPY.trustLine}
            </p>
          </div>

          <div className="relative aspect-[159/100] lg:aspect-auto lg:min-h-96">
            <ImageSlot
              src={heroImage}
              alt="Laptop, headphones, desk lamp, textbooks, backpack and sneakers. Sticker: good finds, up to 70% less than retail. Label: New semester. Secondhand wins."
              className="absolute inset-0"
            />
          </div>
        </div>
      </PageContainer>
    </section>
  )
}
