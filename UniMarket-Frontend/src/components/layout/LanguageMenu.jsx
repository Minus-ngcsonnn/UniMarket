import useMenu from '../../hooks/useMenu'
import { LANGUAGES } from '../../i18n/languageContext'
import useTranslation from '../../i18n/useTranslation'
import { CheckIcon, ChevronDownIcon, GlobeIcon } from '../icons'

/** Header language switch (globe + EN/VI). The choice is remembered in this browser. */
export default function LanguageMenu({ className = '' }) {
  const { t, lang, setLang } = useTranslation()
  const { isOpen, close, containerRef, triggerRef, toggle, onTriggerKeyDown, onMenuKeyDown, itemRef } = useMenu()
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('language.choose', { language: current.label })}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className={`flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors hover:bg-subtle ${isOpen ? 'bg-subtle' : ''}`}
      >
        <GlobeIcon className="size-5" />
        {current.short}
        <ChevronDownIcon className="size-3.5 text-ink-muted" />
      </button>

      {isOpen && (
        <div role="menu" aria-label={t('language.label')} onKeyDown={onMenuKeyDown} className="absolute top-full right-0 z-40 mt-2 w-44 rounded-card border border-line bg-surface p-1 shadow-pop">
          {LANGUAGES.map((language, index) => (
            <button
              key={language.code}
              ref={itemRef(index)}
              type="button"
              role="menuitemradio"
              aria-checked={language.code === lang}
              lang={language.code}
              onClick={() => {
                setLang(language.code)
                close()
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-subtle focus:bg-subtle focus:outline-none"
            >
              <span>
                <span className="mr-2 inline-block w-6 text-xs font-semibold text-ink-muted">{language.short}</span>
                {language.label}
              </span>
              {language.code === lang && <CheckIcon className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
