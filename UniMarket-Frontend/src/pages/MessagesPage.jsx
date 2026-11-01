import { Link } from 'react-router'
import { MessageCircleIcon } from '../components/icons'
import PageContainer from '../components/layout/PageContainer'
import { buttonClasses } from '../components/ui/buttonClasses'
import { PATHS } from '../routes/paths'

/**
 * Messages (header icon in Figma). Chat between students is not part of the MVP in the Business Plan,
 * so this page explains where order communication happens for now.
 */
export default function MessagesPage() {
  return (
    <PageContainer width="md" className="py-12 sm:py-16">
      <title>Messages · UniMarket</title>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MessageCircleIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Messages are coming soon</h1>
        <p className="max-w-md text-ink-muted">
          Chatting with buyers and sellers will arrive in a later version. Until then, every order update, from confirmation to delivery, appears in My orders.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link to={PATHS.orders} className={buttonClasses()}>
            Go to My orders
          </Link>
          <Link to={PATHS.help} className={buttonClasses({ variant: 'secondary' })}>
            Help center
          </Link>
        </div>
      </div>
    </PageContainer>
  )
}
