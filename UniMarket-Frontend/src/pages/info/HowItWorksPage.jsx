import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import FaqList from '../../components/content/FaqList'
import { BadgeCheckIcon, LockIcon, ShieldCheckIcon } from '../../components/icons'
import { buttonClasses } from '../../components/ui/buttonClasses'
import { FAQ_GROUPS } from '../../constants/faq'
import { SELLER_CONFIRM_HOURS } from '../../constants/order'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'

const BUYING = [
  { title: 'Find it', text: 'Search or browse by category, price, condition and campus.' },
  { title: 'Order it', text: 'Add to cart or use Buy now, and tell the seller where to deliver on campus.' },
  { title: 'Seller confirms', text: `The seller confirms within ${SELLER_CONFIRM_HOURS} hours, or declines if the item is gone.` },
  { title: 'Pay online', text: 'Pay securely on UniMarket. Never transfer money to a seller directly.' },
  { title: 'Receive it', text: 'The seller delivers. Confirm you’ve received it to complete the order.' },
]

const SELLING = [
  { title: 'List for free', text: 'Add photos, an honest description, the condition and your price.' },
  { title: 'Get an order', text: 'A student orders your item and it’s reserved for them.' },
  { title: 'Confirm', text: `Confirm within ${SELLER_CONFIRM_HOURS} hours in My orders → Sales.` },
  { title: 'Wait for payment', text: 'The buyer pays online. Only deliver once the order shows “Paid”.' },
  { title: 'Deliver', text: 'Bring the item to the buyer’s campus address. Done when they confirm.' },
]

const PRINCIPLES = [
  { Icon: BadgeCheckIcon, title: 'Verified emails', text: 'Every account verifies its email with a one-time code.' },
  { Icon: LockIcon, title: 'Online payment only', text: 'No cash, no direct transfers: payments go through UniMarket.' },
  { Icon: ShieldCheckIcon, title: 'Clear steps', text: 'Both sides see the same order status, from order to delivery.' },
]

function Steps({ id, title, steps, cta }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-xl font-extrabold tracking-tight text-ink">
          {t(title)}
        </h2>
        {cta}
      </div>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-card bg-subtle p-4">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">{index + 1}</span>
            <p className="font-semibold text-ink">{t(step.title)}</p>
            <p className="text-sm text-ink-muted">{t(step.text)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** How it works: the Business Plan buying and selling flows explained step by step. */
export default function HowItWorksPage() {
  const { t } = useTranslation()
  const buyingFaq = FAQ_GROUPS.find((group) => group.id === 'payments').items

  return (
    <ContentPage
      eyebrow="How it works"
      title="Buy and sell with your campus, safely"
      intro="UniMarket connects students who have things to sell with students who need them. Here’s how an item goes from one student to another."
    >
      <div className="flex flex-col gap-6">
        <Steps
          id="buying-title"
          title="Buying on UniMarket"
          steps={BUYING}
          cta={
            <Link to={PATHS.marketplace} className={buttonClasses({ size: 'sm' })}>
              {t('Explore marketplace')}
            </Link>
          }
        />
        <Steps
          id="selling-title"
          title="Selling on UniMarket"
          steps={SELLING}
          cta={
            <Link to={PATHS.sell} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              {t('Sell an item')}
            </Link>
          }
        />

        <ul className="grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-card border border-line bg-surface p-5">
              <Icon className="size-6 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-ink">{t(title)}</p>
                <p className="mt-1 text-sm text-ink-muted">{t(text)}</p>
              </div>
            </li>
          ))}
        </ul>

        <section aria-labelledby="faq-title" className="mt-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="faq-title" className="text-xl font-extrabold tracking-tight text-ink">
              {t('Payments & delivery questions')}
            </h2>
            <Link to={PATHS.help} className="text-sm font-semibold text-primary hover:underline">
              {t('All questions')} →
            </Link>
          </div>
          <FaqList items={buyingFaq} />
        </section>
      </div>
    </ContentPage>
  )
}
