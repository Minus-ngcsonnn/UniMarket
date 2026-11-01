import { useOutletContext, useSearchParams } from 'react-router'
import useAsyncData from './useAsyncData'

export const ADMIN_PAGE_SIZES = [8, 16, 32]

/**
 * State of an admin list (search, filters, page, rows per page) kept in the URL, so filters survive
 * reloads and can be shared. The campus comes from the admin top bar (AdminLayout outlet context).
 *
 * @param {string} name list name, used as the request key
 * @param {(params: object) => Promise<{ items, total, page, pageSize, counts }>} load
 * @param {string[]} filterKeys URL parameters used as filters, e.g. ['moderation', 'category']
 */
export default function useAdminList(name, load, filterKeys = []) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { campus } = useOutletContext() ?? {}

  const pageSize = ADMIN_PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : ADMIN_PAGE_SIZES[0]
  const params = {
    q: searchParams.get('q') ?? '',
    page: Math.max(1, Number(searchParams.get('page')) || 1),
    pageSize,
    campus,
    ...Object.fromEntries(filterKeys.map((key) => [key, searchParams.get(key) ?? ''])),
  }
  const query = useAsyncData(() => load(params), `${name}-${JSON.stringify(params)}`)

  /** Changes URL parameters; any change other than the page goes back to page 1. */
  function update(changes) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, String(value)) : next.delete(key)))
        if (!('page' in changes)) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const list = query.data ?? query.previousData
  return {
    params,
    error: query.error,
    reload: query.reload,
    list,
    /** First load: nothing to show yet. */
    isLoading: query.isLoading && !list,
    /** A new page/filter is loading while the previous rows stay visible. */
    isRefreshing: query.isLoading && Boolean(list),
    setFilter: (key, value) => update({ [key]: value }),
    setSearch: (q) => update({ q }),
    setPage: (page) => update({ page: page > 1 ? page : '' }),
    setPageSize: (size) => update({ size: size === ADMIN_PAGE_SIZES[0] ? '' : size }),
  }
}
