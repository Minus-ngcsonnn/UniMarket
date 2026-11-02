import { en } from './messages/en'
import { vi } from './messages/vi'

const DICTIONARIES = { en, vi }
const patternCache = {}
/** Placeholders that hold numbers only match digits, so '{count} items' can't match arbitrary text. */
const NUMERIC = /^(count|number|selected|total|remaining|max|min|hours|length|size|from|to|id|percent)$/

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function compilePattern(key, value) {
  const names = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  const parts = key.split(/\{\w+\}/).map(escapeRegExp)
  let pattern = parts[0]
  names.forEach((name, i) => {
    pattern += (NUMERIC.test(name) ? '([\\d.,]+)' : '(.+?)') + parts[i + 1]
  })
  return { re: new RegExp(`^${pattern}$`, 's'), names, value }
}

/**
 * Phrases with {placeholders} also translate finished English text, e.g. the validator message
 * "Use at least 5 characters." matches "Use at least {count} characters." and fills its translation.
 */
function matchPattern(lang, text) {
  const phrases = DICTIONARIES[lang]?.phrases
  if (!phrases) return undefined
  patternCache[lang] ??= Object.keys(phrases)
    .filter((key) => key.includes('{'))
    .map((key) => compilePattern(key, phrases[key]))
  for (const { re, names, value } of patternCache[lang]) {
    const match = text.match(re)
    if (match) return value.replace(/\{(\w+)\}/g, (m, name) => (names.includes(name) ? match[names.indexOf(name) + 1] : m))
  }
  return undefined
}

/**
 * Translates interface text.
 * - Dotted keys ("header.explore") are looked up in the language's dictionary, then in English.
 * - Anything else is an English phrase used as its own key ("Add to cart"): English returns it as is,
 *   other languages look it up in their `phrases` table (exact phrase first, then phrases with
 *   {placeholders} as patterns). Unknown text stays in English.
 * {name} placeholders are replaced from vars; { one, other } values pick the plural form from vars.count;
 * arrays (e.g. lists of steps) are returned unchanged.
 */
export function translate(lang, key, vars = {}) {
  if (key == null || key === '' || typeof key !== 'string') return key
  const isDotted = /^[\w-]+(\.[\w-]+)+$/.test(key)
  const lookup = (dict) => (isDotted ? key.split('.').reduce((node, part) => node?.[part], dict) : undefined)
  let value = lookup(DICTIONARIES[lang]) ?? lookup(DICTIONARIES.en)
  if (value === undefined && lang !== 'en') value = DICTIONARIES[lang]?.phrases?.[key] ?? matchPattern(lang, key)
  value ??= key
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') value = vars.count === 1 ? value.one : value.other
  return String(value).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match))
}
