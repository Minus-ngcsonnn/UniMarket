import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import MessageBubble from '../components/chat/MessageBubble'
import { ArrowLeftIcon, FlagIcon, MessageCircleIcon, SendIcon } from '../components/icons'
import PageContainer from '../components/layout/PageContainer'
import ReportDialog from '../components/moderation/ReportDialog'
import Alert from '../components/ui/Alert'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import { buttonClasses } from '../components/ui/buttonClasses'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import LoadingState from '../components/ui/LoadingState'
import { USES_BACKEND_AUTH } from '../config/apiConfig'
import useAsyncData from '../hooks/useAsyncData'
import usePolling from '../hooks/usePolling'
import useViewer from '../hooks/useViewer'
import useTranslation from '../i18n/useTranslation'
import { PATHS } from '../routes/paths'
import { CHAT_MESSAGE_MAX, CHAT_PAGE_SIZE, chatApi, chatErrorText, notifyChatChanged, onChatChanged } from '../services/chat/chatApi'
import { resolveImageUrl } from '../utils/demoImages'
import { formatPrice, formatRelativeTime } from '../utils/format'

/** Sale statuses with a label in the dictionaries (statuses.*); others (REMOVED, DRAFT) use the phrase table. */
const STATUS_KEYS = new Set(['AVAILABLE', 'RESERVED', 'SOLD'])
const LIST_POLL_MS = 10000
const MESSAGES_POLL_MS = 4000

/** Adds messages that are not there yet, in id order (polling and sending can return the same message). */
function merge(current, incoming) {
  const known = new Set(current.map((m) => m.id))
  return [...current, ...incoming.filter((m) => !known.has(m.id))].sort((a, b) => a.id - b.id)
}

/** Messages (header icon). Real chat with the backend; in demo / sample-data mode a preview notice. */
export default function MessagesPage() {
  return USES_BACKEND_AUTH ? <LiveMessages /> : <MessagesPreview />
}

function MessagesPreview() {
  const { t } = useTranslation()
  return (
    <PageContainer width="md" className="py-12 sm:py-16">
      <title>{`${t('Messages')} · UniMarket`}</title>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MessageCircleIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('Messages need the UniMarket server')}</h1>
        <p className="max-w-md text-ink-muted">{t('Chat between buyers and sellers works when the app is connected to the UniMarket backend. This preview uses sample data only.')}</p>
        <Link to={PATHS.orders} className={buttonClasses()}>
          {t('Go to My orders')}
        </Link>
      </div>
    </PageContainer>
  )
}

function LiveMessages() {
  const { t } = useTranslation()
  const { id } = useParams()
  const viewer = useViewer()
  const list = useAsyncData(() => chatApi.list(), 'my-conversations')
  const { reload } = list
  usePolling(reload, LIST_POLL_MS, !viewer.isAdmin)
  useEffect(() => onChatChanged(reload), [reload])

  if (viewer.isAdmin) {
    return (
      <PageContainer width="md" className="py-12">
        <title>{`${t('Messages')} · UniMarket`}</title>
        <EmptyState
          titleAs="h1"
          title={t('Admins don’t chat with students')}
          description={t('Reported conversations can be read from the report in the admin workspace.')}
          action={
            <Link to={PATHS.adminReports} className={buttonClasses()}>
              {t('Violation reports')}
            </Link>
          }
        />
      </PageContainer>
    )
  }

  const conversations = list.data ?? []
  return (
    <PageContainer className="py-4 sm:py-6">
      <title>{`${t('Messages')} · UniMarket`}</title>
      <h1 className={`mb-4 text-2xl font-extrabold tracking-tight text-ink ${id ? 'hidden md:block' : ''}`}>{t('Messages')}</h1>
      <div className="grid h-[calc(100dvh-11rem)] min-h-[30rem] overflow-hidden rounded-card border border-line bg-surface md:grid-cols-[20rem_minmax(0,1fr)]">
        <nav aria-label={t('Conversations')} className={`min-h-0 overflow-y-auto border-line md:border-r ${id ? 'hidden md:block' : ''}`}>
          {list.error && !list.data ? (
            <ErrorState title={t('Couldn’t load your messages')} message={t(chatErrorText(list.error))} onRetry={reload} />
          ) : list.isLoading ? (
            <LoadingState message={t('Loading messages…')} />
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={<MessageCircleIcon className="size-6" />}
              title={t('No messages yet')}
              description={t('Open a listing and choose “Message seller” to ask a question.')}
              className="px-4 py-10"
            />
          ) : (
            <ul className="divide-y divide-line">
              {conversations.map((c) => (
                <ConversationRow key={c.id} conversation={c} active={String(c.id) === id} />
              ))}
            </ul>
          )}
        </nav>
        <section className={`min-h-0 ${id ? 'flex' : 'hidden md:flex'} flex-col`}>
          {id ? (
            <ConversationView key={id} id={id} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-muted">{t('Choose a conversation to read it.')}</div>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

function ConversationRow({ conversation: c, active }) {
  const { t } = useTranslation()
  const last = c.lastMessage
  return (
    <li>
      <Link
        to={PATHS.conversation(c.id)}
        aria-current={active ? 'page' : undefined}
        className={`flex gap-3 px-4 py-3 transition-colors ${active ? 'bg-primary-soft' : 'hover:bg-subtle'}`}
      >
        <Avatar name={c.counterpart?.name} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-sm ${c.unreadCount ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{c.counterpart?.name}</p>
            {(c.lastMessageAt ?? c.createdAt) && <span className="shrink-0 text-[11px] text-ink-muted">{formatRelativeTime(c.lastMessageAt ?? c.createdAt)}</span>}
          </div>
          <p className="truncate text-xs text-ink-muted">{c.listing?.title}</p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className={`truncate text-sm ${c.unreadCount ? 'font-medium text-ink' : 'text-ink-muted'}`}>
              {last ? `${last.mine ? `${t('You')}: ` : ''}${last.body}` : t('No messages yet')}
            </p>
            {c.unreadCount > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                <span className="sr-only">{t('Unread')}: </span>
                {c.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}

/** One conversation: header with the listing, messages (polled), composer, report. Remounted per conversation id. */
function ConversationView({ id }) {
  const { t } = useTranslation()
  const head = useAsyncData(() => chatApi.get(id), `conversation-${id}`)
  const [messages, setMessages] = useState(null) // null while the first page loads
  const [hasOlder, setHasOlder] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [isReporting, setIsReporting] = useState(false)
  const scrollRef = useRef(null)
  const lastId = messages?.at(-1)?.id

  useEffect(() => {
    let active = true
    chatApi.messages(id, { limit: CHAT_PAGE_SIZE }).then(
      (page) => {
        if (!active) return
        setMessages(page)
        setHasOlder(page.length === CHAT_PAGE_SIZE)
        if (page.some((m) => !m.mine)) chatApi.markRead(id).then(notifyChatChanged, () => {})
      },
      (error) => active && setLoadError(error),
    )
    return () => {
      active = false
    }
  }, [id])

  // Keep the newest message in view when one arrives (not when older ones are loaded above).
  useLayoutEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [lastId])

  usePolling(async () => {
    if (!messages) return
    try {
      const newer = await chatApi.messages(id, lastId ? { after: lastId } : { limit: CHAT_PAGE_SIZE })
      if (newer.length === 0) return
      setMessages((current) => merge(current ?? [], newer))
      if (newer.some((m) => !m.mine)) chatApi.markRead(id).then(notifyChatChanged, () => {})
    } catch {
      // keep the current messages; the next poll tries again
    }
  }, MESSAGES_POLL_MS)

  async function loadOlder() {
    const older = await chatApi.messages(id, { before: messages[0].id, limit: CHAT_PAGE_SIZE })
    setHasOlder(older.length === CHAT_PAGE_SIZE)
    setMessages((current) => merge(current, older))
  }

  async function send(event) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || isSending) return
    setIsSending(true)
    setSendError(null)
    try {
      const message = await chatApi.send(id, text)
      setMessages((current) => merge(current ?? [], [message]))
      setDraft('')
      notifyChatChanged()
    } catch (error) {
      setSendError(chatErrorText(error))
      if (error?.code === 'CHAT_UNAVAILABLE') head.reload()
    } finally {
      setIsSending(false)
    }
  }

  function handleKeyDown(event) {
    // Enter sends, Shift+Enter adds a line. Never while an IME (e.g. Vietnamese Telex) is composing a character.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event)
  }

  const error = head.error ?? loadError
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorState title={t('Couldn’t open this conversation')} message={t(chatErrorText(error))} onRetry={() => window.location.reload()} />
      </div>
    )
  }
  const c = head.data
  if (!c || !messages) return <LoadingState className="flex-1" message={t('Loading messages…')} />

  const imageUrl = resolveImageUrl(c.listing.mainImageUrl) // seeded demo references map to their reference photo
  const canReport = messages.some((m) => !m.mine)
  const canSend = c.counterpartActive
  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <Link to={PATHS.messages} aria-label={t('Back to conversations')} className="-ml-1 rounded-full p-1.5 text-ink-muted hover:bg-subtle md:hidden">
          <ArrowLeftIcon className="size-5" />
        </Link>
        <Avatar name={c.counterpart?.name} size="sm" />
        <div className="min-w-0 flex-1">
          <Link to={PATHS.user(c.counterpart.id)} className="block truncate text-sm font-semibold text-ink hover:text-primary hover:underline">
            {c.counterpart.name}
          </Link>
          <p className="truncate text-xs text-ink-muted">{c.myRole === 'BUYER' ? t('Seller of this listing') : t('Interested buyer')}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          disabled={!canReport}
          title={canReport ? undefined : t('You can report a conversation once the other person has written.')}
          onClick={() => setIsReporting(true)}
        >
          <FlagIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('Report')}</span>
        </Button>
      </header>

      <Link to={PATHS.product(c.listing.id)} className="flex items-center gap-3 border-b border-line bg-canvas px-3 py-2 hover:bg-subtle sm:px-4">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="size-10 shrink-0 rounded-control object-cover" />
        ) : (
          <span className="size-10 shrink-0 rounded-control bg-subtle" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{c.listing.title}</p>
          <p className="text-xs text-ink-muted">
            {formatPrice(c.listing.price)} · {STATUS_KEYS.has(c.listing.status) ? t(`statuses.${c.listing.status}`) : t(c.listing.status)}
          </p>
        </div>
      </Link>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-canvas/60 px-3 py-4 sm:px-4">
        {hasOlder && (
          <div className="mb-3 text-center">
            <Button size="sm" variant="secondary" onClick={loadOlder}>
              {t('Load earlier messages')}
            </Button>
          </div>
        )}
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">{t('Say hello and ask about the item. Messages are visible only to the two of you (and to admins if the chat is reported).')}</p>
        ) : (
          <ol role="log" aria-live="polite" aria-label={t('Messages')} className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} mine={m.mine} warnPayment />
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={send} className="border-t border-line bg-surface px-3 py-3 sm:px-4">
        {!canSend && (
          <Alert variant="warning" className="mb-2">
            {t('This account is no longer active. You can read the conversation but can’t send new messages.')}
          </Alert>
        )}
        {sendError && <p className="mb-2 text-sm text-danger">{t(sendError)}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor={`chat-${id}`} className="sr-only">
            {t('Write a message')}
          </label>
          <textarea
            id={`chat-${id}`}
            rows={1}
            value={draft}
            maxLength={CHAT_MESSAGE_MAX}
            disabled={!canSend}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('Write a message…')}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-subtle [field-sizing:content]"
          />
          <Button type="submit" disabled={!canSend || !draft.trim()} loading={isSending} aria-label={t('Send')}>
            <SendIcon className="size-4" />
            <span className="sr-only sm:not-sr-only">{t('Send')}</span>
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted">{t('Pay only through UniMarket checkout. Never transfer money or share bank details in chat.')}</p>
      </form>

      {isReporting && (
        <ReportDialog target={{ type: 'CONVERSATION', id: c.id, label: `${c.counterpart.name} · ${c.listing.title}` }} onClose={() => setIsReporting(false)} />
      )}
    </>
  )
}
