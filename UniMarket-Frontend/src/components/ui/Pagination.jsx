import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/** Page numbers to show: first, last, current ±1, with '…' gaps (e.g. 1 2 3 … 15). */
function pageItems(current, totalPages) {
  const pages = new Set([1, totalPages, current - 1, current, current + 1])
  if (current <= 3) [2, 3].forEach((p) => pages.add(p))
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ['gap', page] : [page]))
}

/**
 * Figma catalog pagination: "Showing 1–9 of 128 items" + page buttons + "Next".
 * Renders only the summary when everything fits on one page.
 */
export default function Pagination({ page, pageSize, total, onPageChange, itemLabel = 'items' }) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  const baseButton = 'flex h-9 min-w-9 items-center justify-center rounded-control px-2 text-sm transition-colors'

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm text-ink-muted">
        {t('Showing {from}–{to} of {total} {items}', { from, to, total, items: t(itemLabel) })}
      </p>

      {totalPages > 1 && (
        <nav aria-label={t("Pagination")} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label={t("Previous page")}
            className={`${baseButton} text-ink-muted hover:bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            <ChevronLeftIcon className="size-4" />
          </button>

          {pageItems(page, totalPages).map((item, index) =>
            item === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-ink-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                className={`${baseButton} ${item === page ? 'bg-primary font-medium text-white' : 'text-ink-muted hover:bg-subtle hover:text-ink'}`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className={`${baseButton} gap-1 px-3 font-medium text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            {t("Next")}
            <ChevronRightIcon className="size-4" />
          </button>
        </nav>
      )}
    </div>
  )
}
