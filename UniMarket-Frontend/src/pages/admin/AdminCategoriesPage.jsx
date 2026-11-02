import { createElement } from 'react'
import { Link, useOutletContext } from 'react-router'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import DataTable from '../../components/admin/DataTable'
import { CATEGORIES } from '../../constants/categories'
import useAsyncData from '../../hooks/useAsyncData'
import { PATHS } from '../../routes/paths'
import { adminService } from '../../services/admin/adminService'
import useTranslation from '../../i18n/useTranslation'

const ICONS = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.Icon]))

/** Category name and tagline in the interface language. */
function CategoryCell({ row }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">{ICONS[row.slug] && createElement(ICONS[row.slug], { className: "size-4.5" })}</span>
      <div>
        <p className="font-medium text-ink">{t(row.name)}</p>
        <p className="text-xs text-ink-muted">{t(row.tagline)}</p>
      </div>
    </div>
  )
}

const columns = [
  {
    key: 'name',
    header: 'Category',
    render: (row) => <CategoryCell row={row} />,
  },

  { key: 'total', header: 'All listings', className: 'text-right tabular-nums', render: (row) => row.total },
  { key: 'active', header: 'Active', className: 'text-right tabular-nums', render: (row) => row.active },
  {
    key: 'pending',
    header: 'Awaiting review',
    className: 'text-right tabular-nums',
    render: (row) =>
      row.pending > 0 ? (
        <Link to={`${PATHS.adminProducts}?moderation=PENDING&category=${row.slug}`} className="font-semibold text-primary hover:underline">
          {row.pending}
        </Link>
      ) : (
        <span className="text-ink-muted">0</span>
      ),
  },
]

/** Admin › Categories, read only: the category list is fixed in this version (approved scope). */
export default function AdminCategoriesPage() {
  const { t } = useTranslation()
  const { campus } = useOutletContext() ?? {}
  const { data, previousData, error, isLoading, reload } = useAsyncData(() => adminService.listCategories({ campus }), `admin-categories-${campus}`)
  const rows = (data ?? previousData)?.items

  return (
    <>
      <title>{t("Categories · UniMarket Admin")}</title>
      <AdminPageHeader title={t("Categories")} description={t("Read only. Categories are fixed in this version; adding or renaming them will come with the backend.")} />
      <DataTable
        caption="Categories"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.slug}
        isLoading={isLoading && !rows}
        isRefreshing={isLoading && Boolean(rows)}
        error={error}
        onRetry={reload}
        minWidth="36rem"
        emptyTitle={t("No categories")}
      />
    </>
  )
}
