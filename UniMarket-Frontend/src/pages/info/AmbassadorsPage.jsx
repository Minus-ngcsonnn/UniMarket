import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import { BadgeCheckIcon, MessageCircleIcon, SparklesIcon } from '../../components/icons'
import { buttonClasses } from '../../components/ui/buttonClasses'
import { PATHS } from '../../routes/paths'

const ROLE = [
  { Icon: SparklesIcon, title: 'Spread the word', text: 'Introduce UniMarket to classmates, clubs and dormitories on your campus.' },
  { Icon: MessageCircleIcon, title: 'Share feedback', text: 'Tell the team what students need, what works and what doesn’t.' },
  { Icon: BadgeCheckIcon, title: 'Set the example', text: 'Show how to list honestly and trade safely with online payment.' },
]

/** Campus ambassadors (Figma footer link). The programme is not open yet; interested students can get in touch. */
export default function AmbassadorsPage() {
  return (
    <ContentPage
      eyebrow="Campus ambassadors"
      title="Help your campus buy and sell smarter"
      intro="Campus ambassadors are students who help UniMarket grow in their own community, starting at FPT University Hanoi."
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {ROLE.map(({ Icon, title, text }) => (
          <li key={title} className="rounded-card border border-line bg-surface p-5">
            <span className="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary">
              <Icon className="size-5" />
            </span>
            <p className="mt-3 font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-ink-muted">{text}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary-soft p-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-ink">Applications aren’t open yet</p>
          <p className="mt-1 text-sm text-ink-muted">Interested? Send us a message with your campus and programme, and we’ll contact you when the programme starts.</p>
        </div>
        <Link to={PATHS.contact} className={buttonClasses()}>
          Register your interest
        </Link>
      </div>
    </ContentPage>
  )
}
