import { BadgeCheckIcon, RecycleIcon, ShieldCheckIcon } from '../icons'
import PageContainer from '../layout/PageContainer'

// Figma copy, except the middle item: replaced "Meet nearby" to match the Business Plan (online payment only).
const HIGHLIGHTS = [
  { title: 'Your campus. Your community.', text: 'Connect with verified university students.', Icon: BadgeCheckIcon },
  { title: 'Pay online, safely.', text: 'Secure checkout on UniMarket. Sellers arrange delivery.', Icon: ShieldCheckIcon },
  { title: 'Better for your budget & the planet.', text: 'Keep good things in the campus loop.', Icon: RecycleIcon },
]

/** Three short trust statements at the bottom of the homepage (Figma). */
export default function TrustHighlights() {
  return (
    <section aria-label="Why UniMarket">
      <PageContainer>
        <ul className="grid gap-6 md:grid-cols-3">
          {HIGHLIGHTS.map(({ title, text, Icon }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon className="size-6 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  )
}
