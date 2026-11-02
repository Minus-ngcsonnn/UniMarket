import Breadcrumbs from '../layout/Breadcrumbs'
import PageContainer from '../layout/PageContainer'
import useTranslation from '../../i18n/useTranslation'

/**
 * Shared layout for information pages (How it works, Safety, Help, About, legal pages…):
 * breadcrumb, eyebrow, title, intro, then the page content. Optional table of contents on wide screens.
 *
 * @param {{ id: string, title: string }[]} [toc] section links shown beside the content (lg and up)
 */
export default function ContentPage({ title, eyebrow, intro, breadcrumbLabel, toc, children }) {
  const { t } = useTranslation()
  return (
    <PageContainer width="lg" className="py-6 sm:py-8">
      <title>{`${t(title)} · UniMarket`}</title>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: breadcrumbLabel ?? title }]} />

      <header className="mt-4 mb-8 max-w-2xl">
        {eyebrow && <p className="text-xs font-semibold tracking-wide text-primary uppercase">{t(eyebrow)}</p>}
        <h1 className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2.25rem]">{t(title)}</h1>
        {intro && <p className="mt-3 text-lg text-ink-muted">{t(intro)}</p>}
      </header>

      {toc ? (
        <div className="grid items-start gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label={t('On this page')} className="hidden lg:sticky lg:top-36 lg:block">
            <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('On this page')}</p>
            <ul className="mt-3 flex flex-col gap-2 border-l border-line">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="-ml-px block border-l-2 border-transparent pl-3 text-sm text-ink-muted transition-colors hover:border-primary hover:text-primary">
                    {t(item.title)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </PageContainer>
  )
}
