import useTranslation from '../../i18n/useTranslation'

/** A titled block of readable text for information and legal pages (anchor target for the table of contents). */
export default function ProseSection({ id, title, children }) {
  const { t } = useTranslation()
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-36 border-b border-line py-6 first:pt-0 last:border-b-0">
      <h2 id={`${id}-title`} className="text-lg font-bold text-ink">
        {t(title)}
      </h2>
      <div className="mt-3 flex max-w-3xl flex-col gap-3 leading-relaxed text-ink-muted [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  )
}
