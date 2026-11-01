import { Link } from 'react-router'
import sellImage from '../../assets/images/sell-callout-student.jpg'
import { PATHS } from '../../routes/paths'
import { ArrowRightIcon } from '../icons'
import PageContainer from '../layout/PageContainer'
import { buttonClasses } from '../ui/buttonClasses'
import ImageSlot from '../ui/ImageSlot'

/** "Your old stuff. Someone's new favorite." selling banner (Figma). Mobile: photo below the text. */
export default function SellCallout() {
  return (
    <section aria-labelledby="sell-title">
      <PageContainer>
        <div className="grid overflow-hidden rounded-3xl bg-primary-soft lg:grid-cols-[1.03fr_1fr]">
          <div className="flex flex-col gap-3 p-6 sm:gap-4 sm:p-10">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Less clutter. More possibilities.</p>
            <h2 id="sell-title" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Your old stuff. Someone’s new favorite.
            </h2>
            <p className="max-w-md text-ink-muted">
              That textbook you’ve finished? The lamp you no longer need? Give it a second campus life. Listing is always free.
            </p>
            <Link to={PATHS.sell} className={buttonClasses({ size: 'lg', className: 'mt-1 w-full sm:w-fit' })}>
              Start selling for free
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
          <div className="relative aspect-[16/9] sm:aspect-[21/9] lg:aspect-auto">
            <ImageSlot
              src={sellImage}
              alt="Smiling student on campus holding a desk lamp and a used textbook to sell"
              className="absolute inset-0"
            />
          </div>
        </div>
      </PageContainer>
    </section>
  )
}
