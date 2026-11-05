/**
 * Small geo helpers for the pickup / delivery map (V006). Coordinates are WGS84 degrees.
 * Nothing here invents a location: a missing point stays null.
 */

/** Initial map view when nothing is known yet: all of Vietnam. This is a VIEWPORT, never shown as "your position". */
export const VIETNAM_VIEW = { center: [16.05, 106.5], zoom: 5 }

/** GPS fixes worse than this (metres) are flagged so the user adjusts the pin. */
export const POOR_ACCURACY_M = 150

/** A pin further than this from the centre of the chosen area triggers a "check the area" warning (approximate areas). */
export const FAR_FROM_AREA_KM = 15

/** @returns true for a finite latitude / longitude pair inside the valid ranges */
export function isValidPoint(point) {
  return (
    point != null &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  )
}

/** Rounds to 6 decimals (about 0.1 m), the precision stored by the backend (decimal(9,6)). */
export function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6
}

/** @returns { latitude, longitude } rounded for storage, or null */
export function toStoredPoint(point) {
  return isValidPoint(point) ? { latitude: roundCoordinate(point.latitude), longitude: roundCoordinate(point.longitude) } : null
}

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Centre point of a demo area from GET /api/locations/zones, or null when the API sent none. */
export function zoneCenter(zone) {
  const latitude = Number(zone?.centerLatitude)
  const longitude = Number(zone?.centerLongitude)
  return zone && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

/** @returns { zone, km } for the demo area whose centre is closest to the point, or null */
export function nearestZone(point, zones = []) {
  if (!isValidPoint(point)) return null
  let best = null
  for (const zone of zones) {
    const center = zoneCenter(zone)
    if (!center) continue
    const km = distanceKm(point, center)
    if (!best || km < best.km) best = { zone, km }
  }
  return best
}

/** Distance from a point to the centre of one area (km), or null when unknown. */
export function kmFromZone(point, zone) {
  const center = zoneCenter(zone)
  return isValidPoint(point) && center ? distanceKm(point, center) : null
}

/** "21.013100, 105.525100" */
export function formatPoint(point) {
  return isValidPoint(point) ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}` : ''
}

/** OpenStreetMap link that opens the saved point (only built from coordinates the backend allowed this viewer to see). */
export function openStreetMapUrl(point) {
  if (!isValidPoint(point)) return null
  const lat = point.latitude.toFixed(6)
  const lng = point.longitude.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}
