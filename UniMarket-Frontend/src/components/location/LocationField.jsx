import { lazy, Suspense, useId, useState } from 'react'
import useTranslation from '../../i18n/useTranslation'
import { FAR_FROM_AREA_KM, formatPoint, isValidPoint, kmFromZone, nearestZone, toStoredPoint } from '../../utils/geo'
import { CheckCircleIcon, MapPinIcon } from '../icons'
import Button from '../ui/Button'
import LoadingState from '../ui/LoadingState'
import Modal from '../ui/Modal'

// Leaflet and the map tiles are loaded only when a map is opened.
const LocationMap = lazy(() => import('./LocationMap'))

/**
 * A confirmed map / GPS point (V006), shared by the seller's pickup point and the buyer's delivery point.
 * Shows a read-only summary of the confirmed point; changing it always goes through the map and a new confirmation
 * (no free-text coordinates). GPS is requested only when the user presses "Use my current location".
 *
 * @param {{ latitude: number, longitude: number }|null} value the confirmed point
 * @param {(point) => void} onChange called with the confirmed point (rounded to 6 decimals)
 * @param {object} [referenceZone] the area chosen in the same form, for the readable reference / "far" warning
 */
export default function LocationField({ label, hint, value, onChange, error, zones = [], referenceZone, mapTitle, confirmLabel, privacyNote }) {
  const { t } = useTranslation()
  const id = useId()
  const titleId = `${id}-map-title`
  const [open, setOpen] = useState(null) // null | 'map' | 'gps'
  const confirmed = isValidPoint(value)
  const reference = nearestZone(value, zones)
  const farKm = kmFromZone(value, referenceZone)

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined}>
      <p id={`${id}-label`} className="text-sm font-medium text-ink">{t(label)}</p>
      {hint && <p className="text-xs text-ink-muted">{t(hint)}</p>}

      {confirmed && (
        <div className="flex items-start gap-3 rounded-card border border-success/30 bg-success-soft px-3 py-2.5">
          <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">{t('Location confirmed')}</p>
            <p className="text-ink-muted tabular-nums">{formatPoint(value)}</p>
            {reference && (
              <p className="text-ink-muted">
                {t('About {km} km from the centre of {area}', { km: reference.km.toFixed(1), area: `${reference.zone.name}, ${reference.zone.province}` })}
              </p>
            )}
            {farKm != null && farKm > FAR_FROM_AREA_KM && (
              <p className="text-warning">
                {t('This pin is about {km} km from {area}, the area you chose. Check the area or move the pin.', { km: farKm.toFixed(0), area: referenceZone.name })}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen('gps')}>
          <MapPinIcon className="size-4" />
          {t('Use my current location')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen('map')}>
          {confirmed ? t('Change on map') : t('Choose on map')}
        </Button>
      </div>
      {privacyNote && <p className="text-xs text-ink-muted">{t(privacyNote)}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {t(error)}
        </p>
      )}

      {open && (
        <Modal onClose={() => setOpen(null)} labelledBy={titleId} className="w-[min(56rem,calc(100vw-1.5rem))]">
          <Suspense fallback={<LoadingState message={t('Loading the map…')} />}>
            <LocationMap
              title={mapTitle}
              titleId={titleId}
              confirmLabel={confirmLabel}
              initialPoint={confirmed ? value : null}
              startWithGps={open === 'gps'}
              zones={zones}
              referenceZone={referenceZone}
              onCancel={() => setOpen(null)}
              onConfirm={(point) => {
                onChange(toStoredPoint(point))
                setOpen(null)
              }}
            />
          </Suspense>
        </Modal>
      )}
    </div>
  )
}
