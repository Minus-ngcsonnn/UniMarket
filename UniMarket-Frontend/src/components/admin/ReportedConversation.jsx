import { useState } from 'react'
import { Link } from 'react-router'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { adminBackendApi, adminErrorText } from '../../services/admin/adminBackendApi'
import { formatPrice } from '../../utils/format'
import MessageBubble from '../chat/MessageBubble'
import { MessageCircleIcon } from '../icons'
import Button from '../ui/Button'
import StatusPill from '../ui/StatusPill'

/**
 * Transcript of a reported conversation for the admin handling the report. Loaded only when the admin asks for it,
 * because every read is recorded in the admin audit log (private messages). The reported person's messages are
 * highlighted.
 */
export default function ReportedConversation({ conversationId, reportedUserId }) {
  const { t } = useTranslation()
  const [state, setState] = useState({ status: 'idle' }) // idle | loading | ready | error

  async function load() {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', data: await adminBackendApi.conversation(conversationId) })
    } catch (error) {
      setState({ status: 'error', message: adminErrorText(error) })
    }
  }

  if (state.status !== 'ready') {
    return (
      <section className="rounded-control border border-line p-3">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <MessageCircleIcon className="size-4 text-primary" />
          {t('Reported conversation')}
        </h3>
        <p className="mb-3 text-sm text-ink-muted">{t('Messages are private. Open them only to handle this report; each read is recorded in the admin audit log.')}</p>
        {state.status === 'error' && <p className="mb-2 text-sm text-danger">{t(state.message)}</p>}
        <Button size="sm" variant="secondary" onClick={load} loading={state.status === 'loading'}>
          {t('Read the conversation')}
        </Button>
      </section>
    )
  }

  const chat = state.data
  const name = (senderId) => (senderId === chat.buyer.id ? chat.buyer.name : chat.seller.name)
  const role = (senderId) => (senderId === chat.buyer.id ? t('Buyer') : t('Seller'))
  return (
    <section className="flex flex-col gap-3 rounded-control border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <MessageCircleIcon className="size-4 text-primary" />
          {t('Reported conversation')} · {t('{count} messages', { count: chat.messages.length })}
        </h3>
        <Link to={PATHS.product(chat.listing.id)} className="text-xs text-primary hover:underline">
          {chat.listing.title} · {formatPrice(chat.listing.price)}
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {[
          ['Buyer', chat.buyer, chat.buyerStatus],
          ['Seller', chat.seller, chat.sellerStatus],
        ].map(([label, person, status]) => (
          <div key={label} className="rounded-control bg-subtle px-2.5 py-2">
            <dt className="text-ink-muted">{t(label)}</dt>
            <dd className="flex flex-wrap items-center gap-1.5 font-medium text-ink">
              <Link to={PATHS.user(person.id)} className="hover:text-primary hover:underline">
                {person.name}
              </Link>
              <StatusPill tone={status === 'ACTIVE' ? 'success' : 'danger'}>{t(status)}</StatusPill>
              {person.id === reportedUserId && <StatusPill tone="warning">{t('Reported')}</StatusPill>}
            </dd>
          </div>
        ))}
      </dl>
      <ol aria-label={t('Messages')} className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-control bg-canvas p-3">
        {chat.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            mine={m.senderId === chat.seller.id}
            senderLabel={`${name(m.senderId)} (${role(m.senderId)})${m.senderId === reportedUserId ? ` · ${t('Reported')}` : ''}`}
          />
        ))}
      </ol>
    </section>
  )
}
