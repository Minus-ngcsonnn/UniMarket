import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import { BadgeCheckIcon, RecycleIcon, ShieldCheckIcon } from '../../components/icons'
import { buttonClasses } from '../../components/ui/buttonClasses'
import { PATHS } from '../../routes/paths'

const VALUES = [
  { Icon: BadgeCheckIcon, title: 'Students first', text: 'A marketplace only for verified university students, so you know who you’re dealing with.' },
  { Icon: ShieldCheckIcon, title: 'Safe by design', text: 'Every order follows the same clear steps, and payments only happen online through UniMarket.' },
  { Icon: RecycleIcon, title: 'Good things, longer', text: 'Textbooks, tech and dorm items get a second campus life instead of ending up in the bin.' },
]

// Project team (from the Business Plan, ISC301 Group 3).
const TEAM = ['Nguyễn Khắc Gia Huy', 'Nguyễn Quang Anh', 'Đoàn Tuấn Hùng', 'Nguyễn Trọng Phát', 'Lê Ngọc Sơn']

/** About UniMarket: mission, values and the student team behind the project. */
export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="About us"
      title="The marketplace that gets student life"
      intro="UniMarket is a second-hand marketplace where university students buy and sell with each other, starting at FPT University’s Hanoi (Hoa Lac) campus."
    >
      <section aria-labelledby="mission-title" className="grid items-center gap-6 rounded-2xl bg-primary p-6 text-white sm:p-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 id="mission-title" className="text-2xl font-extrabold tracking-tight">
            Why we built UniMarket
          </h2>
          <p className="mt-3 text-white/85">
            Every semester, students buy textbooks, calculators and dorm essentials they only need for a while, and others throw away things that still work. UniMarket makes it simple and safe to pass them on, within your own campus community.
          </p>
        </div>
        <p className="text-lg font-medium text-white/95 lg:border-l lg:border-white/20 lg:pl-8">Buy smart. Sell easy. Stay campus-connected.</p>
      </section>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {VALUES.map(({ Icon, title, text }) => (
          <li key={title} className="rounded-card border border-line bg-surface p-5">
            <Icon className="size-6 text-primary" />
            <p className="mt-3 font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-ink-muted">{text}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="team-title" className="mt-10">
        <h2 id="team-title" className="text-xl font-extrabold tracking-tight text-ink">
          Made for students, by students
        </h2>
        <p className="mt-2 max-w-2xl text-ink-muted">UniMarket is being built by Group 3 of the ISC301 course (class IS1906-EIS) at FPT University.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {TEAM.map((name) => (
            <li key={name} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink">
              {name}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to={PATHS.marketplace} className={buttonClasses()}>
          Explore marketplace
        </Link>
        <Link to={PATHS.howItWorks} className={buttonClasses({ variant: 'secondary' })}>
          How it works
        </Link>
      </div>
    </ContentPage>
  )
}
