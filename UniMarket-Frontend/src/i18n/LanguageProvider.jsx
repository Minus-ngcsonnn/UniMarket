import { useEffect, useState } from 'react'
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_STORAGE_KEY, LanguageContext } from './languageContext'
import { setFormatLanguage } from '../utils/format'
import { translate } from './translate'

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (LANGUAGES.some((l) => l.code === saved)) return saved
  } catch {
    // Storage blocked: fall back to the default language.
  }
  return DEFAULT_LANGUAGE
}

/**
 * Interface language (EN / VI) for the whole app. The choice is remembered in this browser.
 * Only interface text is translated; listings, reviews and other student-written text stay as written.
 */
export default function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLanguage)
  // Dates and relative times follow the interface language (module-level, before children format).
  setFormatLanguage(lang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  function setLang(code) {
    setLangState(code)
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    } catch {
      // Not saved: the choice still applies until the page is reloaded.
    }
  }

  const value = { lang, setLang, t: (key, vars) => translate(lang, key, vars) }
  return <LanguageContext value={value}>{children}</LanguageContext>
}
