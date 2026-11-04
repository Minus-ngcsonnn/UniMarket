import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import DataTable from '../../../components/admin/DataTable'
import useAsyncData from '../../../hooks/useAsyncData'
import { adminBackendApi, adminErrorText } from '../../../services/admin/adminBackendApi'
import { findCategory, INITIAL_REFERENCE } from '../../../services/products/catalogReference'
import useTranslation from '../../../i18n/useTranslation'

/** Admin › Categories with the real API: read only (no category management endpoint exists). */
export default function LiveAdminCategoriesPage() {
  const { t } = useTranslation()
  const { data, error, isLoading, reload } = useAsyncData(() => adminBackendApi.categories(), 'live-admin-categories')
  const columns = [
    {
      key: 'name',
      header: 'Category',
      render: (row) => {
        const design = findCategory(INITIAL_REFERENCE, row.slug)
        const Icon = design?.Icon
        return (
          <span className="flex items-center gap-2 font-medium text-ink">
            {Icon && <Icon className="size-4 text-primary" />}
            {t(design?.name ?? row.name)}
          </span>
        )
      },
    },
    { key: 'slug', header: 'Slug', render: (row) => <code className="text-xs text-ink-muted">{row.slug}</code> },
    { key: 'available', header: 'Public listings', render: (row) => row.availableCount },
  ]
  return (
    <>
      <title>{t('Categories · UniMarket Admin')}</title>
      <AdminPageHeader title={t('Categories')} description={t('Active categories from the database. Read only: adding or renaming categories has no API yet.')} />
      <DataTable caption={t('Categories')} columns={columns} rows={data} isLoading={isLoading} error={error && { message: adminErrorText(error) }} onRetry={reload} minWidth="32rem" emptyTitle={t('No categories')} />
    </>
  )
}
