import useTranslation from '../../i18n/useTranslation'

/** Title row of an admin page: heading, short description and page actions. */
export default function AdminPageHeader({ title, description, actions }) {
  const { t } = useTranslation()
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.6rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[1.85rem]">{t(title)}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{t(description)}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
