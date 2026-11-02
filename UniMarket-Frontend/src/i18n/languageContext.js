import { createContext } from 'react'

/** { lang, setLang, t } — provided by LanguageProvider. */
export const LanguageContext = createContext(null)

export const LANGUAGES = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'vi', short: 'VI', label: 'Tiếng Việt' },
]
export const DEFAULT_LANGUAGE = 'en'
export const LANGUAGE_STORAGE_KEY = 'unimarket.language'
