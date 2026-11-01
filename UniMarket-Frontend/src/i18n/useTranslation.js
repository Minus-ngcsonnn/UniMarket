import { useContext } from 'react'
import { DEFAULT_LANGUAGE, LanguageContext } from './languageContext'
import { translate } from './translate'

/** { t, lang, setLang }. Works without a provider too (English), e.g. in isolated tests. */
export default function useTranslation() {
  return useContext(LanguageContext) ?? { lang: DEFAULT_LANGUAGE, setLang: () => {}, t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars) }
}
