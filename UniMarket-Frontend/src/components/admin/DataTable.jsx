import { useId } from 'react'
import { ADMIN_PAGE_SIZES } from '../../hooks/useAdminList'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import Pagination from '../ui/Pagination'

/**
 * Admin data table (Figma "Marketplace management" table style) with loading, empty and error states,
 * pagination and rows per page. Scrolls sideways on small screens instead of squeezing the columns.
 *
 * @param {{ key: string, header: string, render: (row) => React.ReactNode, className?: string, hideHeader?: boolean }[]} columns
 * @param {object[]} [rows]
 * @param {string} caption accessible table name
 * @param {{ page, pageSize, total, onPageChange, onPageSizeChange?, itemLabel? }} [pagination]
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  caption,
  isLoading = false,
  isRefreshing = false,
  error,
  onRetry,
  emptyTitle = 'Nothing here',
  emptyDescription,
  pagination,
  minWidth = '48rem',
}) {
  const sizeId = useId()

  if (error) return <ErrorState title={`Couldn’t load ${caption.toLowerCase()}`} message={error.message} onRetry={onRetry} />

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm" style={{ minWidth }} aria-busy={isLoading || isRefreshing || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`px-4 py-3 font-medium first:pl-5 last:pr-5 ${column.className ?? ''}`}>
                  {column.hideHeader ? <span className="sr-only">{column.header}</span> : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`transition-opacity ${isRefreshing ? 'opacity-60' : ''}`}>
            {isLoading
              ? [0, 1, 2, 3].map((row) => (
                  <tr key={row} className="border-t border-line">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-4 first:pl-5 last:pr-5">
                        <span className="block h-4 animate-pulse rounded-full bg-subtle" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => (
                  <tr key={rowKey(row)} className="border-t border-line align-middle transition-colors hover:bg-canvas">
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 first:pl-5 last:pr-5 ${column.className ?? ''}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && rows?.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} className="rounded-none border-0 border-t" />}
      </div>

      {pagination && !isLoading && pagination.total > 0 && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.onPageChange} itemLabel={pagination.itemLabel} />
          </div>
          {pagination.onPageSizeChange && (
            <div className="flex items-center justify-center gap-2 text-sm text-ink-muted lg:order-first lg:justify-start">
              <label htmlFor={sizeId}>Rows per page</label>
              <select
                id={sizeId}
                value={pagination.pageSize}
                onChange={(event) => pagination.onPageSizeChange(Number(event.target.value))}
                className="h-9 rounded-control border border-line bg-surface px-2 text-ink focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                {ADMIN_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
