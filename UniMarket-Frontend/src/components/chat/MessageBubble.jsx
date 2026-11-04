import { looksLikePaymentDetails } from '../../services/chat/chatApi'
import useTranslation from '../../i18n/useTranslation'
import { formatDateTime } from '../../utils/format'
import { AlertTriangleIcon } from '../icons'

/**
 * One chat message. `mine` aligns it to the right. Text is rendered as plain text (never HTML).
 * @param {string} [senderLabel] shown above the bubble (admin transcript)
 * @param {boolean} [warnPayment] remind about off-platform payments when the text looks like bank / phone details
 */
export default function MessageBubble({ message, mine, senderLabel, warnPayment = false }) {
  const { t } = useTranslation()
  const showWarning = warnPayment && !mine && looksLikePaymentDetails(message.body)
  return (
    <li className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      {senderLabel && <span className="px-1 text-xs font-medium text-ink-muted">{senderLabel}</span>}
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[70%] ${
          mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md border border-line bg-surface text-ink'
        }`}
      >
        {message.body}
      </p>
      <time dateTime={message.createdAt} className="px-1 text-[11px] text-ink-muted">
        {formatDateTime(message.createdAt)}
      </time>
      {showWarning && (
        <p className="flex max-w-[85%] items-start gap-1.5 rounded-control bg-warning-soft px-2.5 py-1.5 text-xs text-ink sm:max-w-[70%]">
          <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-warning" />
          {t('This message contains a long number. Never transfer money outside UniMarket: pay only at checkout.')}
        </p>
      )}
    </li>
  )
}
