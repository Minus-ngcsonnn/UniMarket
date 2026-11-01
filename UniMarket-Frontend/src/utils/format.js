/**
 * Display formatting helpers. All prices are whole Vietnamese dong (decision: VND).
 */

const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

/** 450000 -> "450.000 ₫" */
export function formatPrice(value) {
  return priceFormatter.format(value)
}

/** 450000 -> "450.000" (for input fields, without the currency sign) */
export function formatNumber(value) {
  return numberFormatter.format(value)
}

/** "450.000 ₫" / "450,000" / "450000" -> 450000 (digits only; '' -> null) */
export function parseDigits(text) {
  const digits = String(text ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : null
}

/** "12 min ago", "2 hours ago", "3 days ago", or a date for older items (Figma card style). */
export function formatRelativeTime(isoDate, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(isoDate).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return formatDate(isoDate)
}

/** "19 Oct 2026" */
export function formatDate(isoDate) {
  return dateFormatter.format(new Date(isoDate))
}

/** "10:42" */
export function formatTime(isoDate) {
  return timeFormatter.format(new Date(isoDate))
}

/** "1 Nov 2026, 10:42" */
export function formatDateTime(isoDate) {
  return `${formatDate(isoDate)}, ${formatTime(isoDate)}`
}

/** "Minh Nguyen" -> "MN" */
export function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
