import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import useTranslation from '../../i18n/useTranslation'
import { FAR_FROM_AREA_KM, POOR_ACCURACY_M, VIETNAM_VIEW, formatPoint, isValidPoint, kmFromZone, nearestZone, zoneCenter } from '../../utils/geo'
import { MapPinIcon, XIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'

/* OpenStreetMap standard tiles: free, no key; attribution is required and heavy / bulk use is not allowed
   (https://operations.osmfoundation.org/policies/tiles/). Tiles are requested only while the map is open. */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }

// A CSS pin (no image assets, so the bundler cannot break the default Leaflet marker images).
const PIN_ICON = L.divIcon({
  className: '',
  html: '<span style="display:block;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#2459e0;border:3px solid #fff;box-shadow:0 2px 8px rgba(24,36,59,.45)"></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
})

/** Keeps the Leaflet size right inside the dialog and moves the view when asked. */
function MapController({ view, onReady }) {
  const map = useMap()
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 50)
    onReady?.(map)
    return () => window.clearTimeout(timer)
  }, [map, onReady])
  useEffect(() => {
    if (view) map.setView(view.center, view.zoom, { animate: true })
  }, [map, view])
  return null
}

/** Click anywhere on the map to place (or move) the pin. */
function ClickToPlace({ onPlace }) {
  useMapEvents({ click: (event) => onPlace({ latitude: event.latlng.lat, longitude: event.latlng.lng }) })
  return null
}

function gpsErrorMessage(error) {
  if (error === 'insecure') return 'Location needs a secure (HTTPS) page. Choose the point on the map instead.'
  if (error === 'unsupported') return 'This browser cannot share its location. Choose the point on the map instead.'
  if (error?.code === 1) return 'Location permission was denied. You can still choose the point on the map.'
  if (error?.code === 3) return 'Finding your location took too long. Try again or choose the point on the map.'
  return 'Your location is not available right now. Try again or choose the point on the map.'
}

/**
 * Shared map for the seller's pickup point and the buyer's delivery point (V006). Real OpenStreetMap tiles;
 * click to place the pin, drag it to adjust, zoom with the controls / wheel / pinch. GPS is used only when the user
 * asks for it (one reading, no tracking) and is only a starting suggestion: nothing is saved until "Confirm".
 *
 * @param {{ latitude: number, longitude: number }|null} initialPoint a previously confirmed point to reopen
 * @param {boolean} startWithGps true when opened with "Use my current location"
 * @param {Array} zones demo areas with approximate centres (readable reference, "far from area" warning)
 * @param {object} [referenceZone] the area chosen in the form (pickup area / delivery area), if any
 */
export default function LocationMap({ title, titleId, confirmLabel, initialPoint, startWithGps = false, zones = [], referenceZone, onConfirm, onCancel }) {
  const { t } = useTranslation()
  const [pin, setPin] = useState(isValidPoint(initialPoint) ? initialPoint : null)
  const [gps, setGps] = useState({ status: 'idle' }) // idle | locating | found | error
  const [tileError, setTileError] = useState(false)
  const [view, setView] = useState(null)
  const started = useRef(false)

  const initialView = useMemo(() => {
    if (isValidPoint(initialPoint)) return { center: [initialPoint.latitude, initialPoint.longitude], zoom: 17 }
    const center = zoneCenter(referenceZone)
    // The chosen AREA's approximate centre (or all of Vietnam) is only a viewport, never presented as the user's position.
    return center ? { center: [center.latitude, center.longitude], zoom: 14 } : VIETNAM_VIEW
  }, [initialPoint, referenceZone])

  function locate() {
    if (!window.isSecureContext) return setGps({ status: 'error', error: 'insecure' })
    if (!navigator.geolocation) return setGps({ status: 'error', error: 'unsupported' })
    setGps({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        setGps({ status: 'found', point, accuracy: position.coords.accuracy })
        setPin(point)
        setView({ center: [point.latitude, point.longitude], zoom: 17 })
      },
      (error) => setGps({ status: 'error', error }),
      GPS_OPTIONS,
    )
  }

  useEffect(() => {
    // Only when the user opened the map with "Use my current location" (an explicit request), once.
    if (startWithGps && !started.current) {
      started.current = true
      locate()
    }
  })

  const reference = nearestZone(pin, zones)
  const farKm = kmFromZone(pin, referenceZone)
  const isFar = farKm != null && farKm > FAR_FROM_AREA_KM
  const markerHandlers = useMemo(
    () => ({ dragend: (event) => { const ll = event.target.getLatLng(); setPin({ latitude: ll.lat, longitude: ll.lng }) } }),
    [],
  )

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-ink">{t(title)}</h2>
          <p className="text-sm text-ink-muted">{t('Click the map to place the pin, then drag it to the exact spot.')}</p>
        </div>
        <button type="button" onClick={onCancel} aria-label={t('Close')} className="flex size-9 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink">
          <XIcon className="size-5" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 sm:px-5">
        <Button size="sm" variant="secondary" onClick={locate} loading={gps.status === 'locating'} disabled={gps.status === 'locating'}>
          <MapPinIcon className="size-4" />
          {t('Use my current location')}
        </Button>
        {gps.status === 'locating' && <span className="text-sm text-ink-muted">{t('Finding your location…')}</span>}
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 sm:px-5">
        {gps.status === 'error' && <Alert variant="warning" title={t('Location unavailable')}>{t(gpsErrorMessage(gps.error))}</Alert>}
        {gps.status === 'found' && gps.accuracy > POOR_ACCURACY_M && (
          <Alert variant="warning" title={t('Low GPS accuracy')}>
            {t('Your device is only accurate to about {meters} m. Move the pin to the exact spot.', { meters: Math.round(gps.accuracy) })}
          </Alert>
        )}
        {tileError && <Alert variant="danger" title={t('The map could not load')}>{t('Check your internet connection and try again.')}</Alert>}
      </div>

      <div className="relative mx-4 mt-3 h-[min(60dvh,26rem)] overflow-hidden rounded-card border border-line sm:mx-5">
        <MapContainer center={initialView.center} zoom={initialView.zoom} scrollWheelZoom className="h-full w-full" aria-label={t('Map')}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }} />
          <MapController view={view} />
          <ClickToPlace onPlace={setPin} />
          {gps.status === 'found' && <Circle center={[gps.point.latitude, gps.point.longitude]} radius={gps.accuracy} pathOptions={{ color: '#2459e0', weight: 1, fillOpacity: 0.08 }} />}
          {pin && <Marker position={[pin.latitude, pin.longitude]} icon={PIN_ICON} draggable eventHandlers={markerHandlers} keyboard title={t('Selected point')} />}
        </MapContainer>
      </div>

      <div className="flex flex-col gap-1 px-4 pt-3 text-sm sm:px-5" aria-live="polite">
        {pin ? (
          <>
            <p className="text-ink">
              <span className="font-medium">{t('Selected point')}:</span> <span className="tabular-nums">{formatPoint(pin)}</span>
            </p>
            {reference && (
              <p className="text-ink-muted">
                {t('About {km} km from the centre of {area}', { km: reference.km.toFixed(1), area: `${reference.zone.name}, ${reference.zone.province}` })}
              </p>
            )}
            {isFar && (
              <p className="text-warning">
                {t('This pin is about {km} km from {area}, the area you chose. Check the area or move the pin.', { km: farKm.toFixed(0), area: referenceZone.name })}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-muted">{t('No point selected yet.')}</p>
        )}
      </div>

      <footer className="mt-3 flex flex-col-reverse gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="secondary" onClick={onCancel}>{t('Cancel')}</Button>
        <Button onClick={() => onConfirm(pin)} disabled={!pin}>{t(confirmLabel)}</Button>
      </footer>
    </div>
  )
}
