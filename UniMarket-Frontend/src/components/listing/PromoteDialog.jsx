import { useId, useState } from 'react'
import useAsyncData from '../../hooks/useAsyncData'
import apiClient from '../../services/apiClient'
import { promotionApi } from '../../services/promotions/promotionApi'
import { describeApiError } from '../../utils/apiErrorMessage'
import { formatDateTime, formatPrice } from '../../utils/format'
import { CheckCircleIcon, XIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import LoadingState from '../ui/LoadingState'
import Modal from '../ui/Modal'
import useTranslation from '../../i18n/useTranslation'

const PROVIDERS = [
  { value: 'MOMO', label: 'MoMo (simulated)' },
  { value: 'ZALOPAY', label: 'ZaloPay (simulated)' },
  { value: 'BANK_QR', label: 'Bank QR (simulated)' },
]
const ERRORS = {
  PROMOTION_NOT_ALLOWED: 'Only an approved, available listing without another pending or running promotion can be promoted.',
}

/**
 * Promote one of my listings (docs/ADMIN_API.md §8). Package price and duration come from the server; the listing is
 * featured only after the server verified the simulated payment (no money is charged). One promotion at a time.
 */
export default function PromoteDialog({ listing, onClose }) {
  const { t } = useTranslation()
  const titleId = useId()
  const packages = useAsyncData(() => promotionApi.packages(), 'promotion-packages')
  const history = useAsyncData(() => apiClient.get(`/me/products/${listing.id}/promotions`).then(({ data }) => data), `promotions-${listing.id}`)
  const [packageId, setPackageId] = useState(null)
  const [provider, setProvider] = useState('MOMO')
  const [attempt, setAttempt] = useState(null)
  const [state, setState] = useState({ status: 'idle', error: null }) // idle | working | paid | failed

  const running = (history.data ?? []).find((p) => p.active)
  const chosen = packageId ?? packages.data?.[0]?.id

  async function start() {
    setState({ status: 'working', error: null })
    try {
      const result = await promotionApi.start(listing.id, chosen, provider)
      setAttempt(result)
      setState({ status: result.status === 'PAID' ? 'paid' : 'idle', error: null })
    } catch (error) {
      setState({ status: 'idle', error: ERRORS[error?.code] ?? describeApiError(error).message })
    }
  }

  async function complete(outcome) {
    setState({ status: 'working', error: null })
    try {
      const result = await promotionApi.completeSimulated(attempt.simulatorUrl, outcome)
      setAttempt(result)
      setState({ status: result.status === 'PAID' ? 'paid' : 'failed', error: null })
      history.reload()
    } catch (error) {
      setState({ status: 'idle', error: describeApiError(error).message })
    }
  }

  const busy = state.status === 'working'
  return (
    <Modal onClose={busy ? () => {} : onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {t('Feature this listing')}
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-muted">{listing.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('Close')} className="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink">
            <XIcon className="size-5" />
          </button>
        </div>
        <Alert variant="warning" title={t('Simulated payment')}>
          {t('Promotions are paid with the payment simulator: no money is charged. Standard listings stay free.')}
        </Alert>

        {state.status === 'paid' ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <CheckCircleIcon className="size-8 text-success" />
            <p className="font-semibold text-ink">{t('Your listing is featured')}</p>
            <p className="text-sm text-ink-muted">
              {t('From {start} to {end}.', { start: formatDateTime(attempt.startsAt), end: formatDateTime(attempt.endsAt) })}
            </p>
            <Button onClick={onClose} className="mt-2">
              {t('Done')}
            </Button>
          </div>
        ) : running ? (
          <Alert variant="info" title={t('Already featured')}>
            {t('Featured until {time}. You can promote it again after that.', { time: formatDateTime(running.endsAt) })}
          </Alert>
        ) : packages.isLoading ? (
          <LoadingState message={t('Loading packages…')} />
        ) : !attempt || attempt.status === 'FAILED' ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-ink">{t('Package')}</legend>
              {(packages.data ?? []).map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm ${chosen === p.id ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink'}`}>
                  <input type="radio" name="package" checked={chosen === p.id} onChange={() => setPackageId(p.id)} className="accent-primary" />
                  <span className="flex-1 font-medium">{t(p.name)}</span>
                  <span className="text-xs text-ink-muted">{t('{hours} h', { hours: p.durationHours })}</span>
                  <span className="font-semibold">{formatPrice(p.price)}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm font-medium text-ink">{t('Payment method')}</legend>
              {PROVIDERS.map((p) => (
                <label key={p.value} className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm ${provider === p.value ? 'border-primary text-primary' : 'border-line text-ink'}`}>
                  <input type="radio" name="promotion-provider" checked={provider === p.value} onChange={() => setProvider(p.value)} className="accent-primary" />
                  {t(p.label)}
                </label>
              ))}
            </fieldset>
            {state.status === 'failed' && <Alert variant="danger" title={t('Simulated payment failed')}>{t('The listing is not featured. You can try again.')}</Alert>}
            <Button size="lg" fullWidth onClick={start} loading={busy} disabled={busy || !chosen}>
              {t('Continue to simulated payment')}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-control bg-subtle px-4 py-3">
              <span className="text-sm text-ink-muted">{t('Amount')}</span>
              <span className="text-xl font-bold text-ink">{formatPrice(attempt.amount)}</span>
            </div>
            {attempt.resumed && <p className="text-sm text-ink-muted">{t('A pending promotion of this listing was resumed.')}</p>}
            {attempt.simulatorUrl ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => complete('SUCCESS')} loading={busy} disabled={busy}>
                  {t('Simulate successful payment')}
                </Button>
                <Button className="flex-1" variant="secondary" onClick={() => complete('FAILURE')} disabled={busy}>
                  {t('Simulate failed payment')}
                </Button>
              </div>
            ) : (
              <Alert variant="info" title={t('Online payment is unavailable')}>
                {t('The payment simulator is turned off on this server and no real provider is connected.')}
              </Alert>
            )}
          </>
        )}
        {state.error && (
          <Alert variant="danger" title={t('Not done')}>
            {t(state.error)}
          </Alert>
        )}
      </div>
    </Modal>
  )
}
