/**
 * Display formatting helpers. All prices are whole Vietnamese dong (decision: VND).
 * Dates and relative times follow the interface language, which LanguageProvider sets through
 * setFormatLanguage().
 */

const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

let formatLanguage = 'en'
let dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
let timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const relativeFormatters = {}

/** Called by LanguageProvider when the interface language changes. @param {'en'|'vi'} lang */
export function setFormatLanguage(lang) {
  if (lang === formatLanguage) return
  formatLanguage = lang
  const locale = lang === 'vi' ? 'vi-VN' : 'en-GB'
  dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
}

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

/**
 * "12 min. ago" / "12 phút trước" (compact, product cards). Older than a week: the date.
 * @param {'en'|'vi'} [lang] defaults to the interface language
 */
export function formatTimeAgo(isoDate, lang = formatLanguage, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(isoDate).getTime()) / 60000))
  const days = Math.round(minutes / 1440)
  if (days >= 7) return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(isoDate))
  relativeFormatters[lang] ??= new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  const rtf = relativeFormatters[lang]
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), 'minute')
  if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), 'hour')
  return rtf.format(-days, 'day')
}

/** "12 min ago", "2 hours ago", "3 days ago", or a date for older items. Vietnamese uses formatTimeAgo. */
export function formatRelativeTime(isoDate, now = Date.now()) {
  if (formatLanguage !== 'en') return formatTimeAgo(isoDate, formatLanguage, now)
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

/** Whole-percent saving against the seller's original price; 0 when there is no valid original price. */
export function savingsPercent(price, originalPrice) {
  return originalPrice > price && price > 0 ? Math.round((1 - price / originalPrice) * 100) : 0
}
