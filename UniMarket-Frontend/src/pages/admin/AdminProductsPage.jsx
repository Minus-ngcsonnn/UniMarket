import AdminPageHeader from '../../components/admin/AdminPageHeader'
import ListingsPanel from '../../components/admin/ListingsPanel'
import FilterTabs from '../../components/ui/FilterTabs'
import { LISTING_MODERATION, LISTING_MODERATION_KEYS } from '../../constants/moderation'
import useAdminList from '../../hooks/useAdminList'
import { adminService } from '../../services/admin/adminService'
import useTranslation from '../../i18n/useTranslation'

/** Admin › Products: listing moderation (Figma "Products" with Pending/Active/Blocked). */
export default function AdminProductsPage() {
  const { t } = useTranslation()
  const list = useAdminList('admin-listings', adminService.listListings, ['moderation', 'category', 'listed', 'sort'])
  const counts = list.list?.counts ?? {}

  return (
    <>
      <title>{t("Products · UniMarket Admin")}</title>
      <AdminPageHeader title={t("Products")} description={t("New and edited listings wait here until you approve them. Blocked listings are hidden from the marketplace.")} />
      <FilterTabs
        label={t("Filter by review status")}
        value={list.params.moderation}
        onChange={(value) => list.setFilter('moderation', value)}
        options={[{ value: '', label: 'All', count: counts.all }, ...LISTING_MODERATION_KEYS.map((key) => ({ value: key, label: LISTING_MODERATION[key].label, count: counts[key] }))]}
        className="mb-4"
      />
      <ListingsPanel list={list} showStatusFilter={false} />
    </>
  )
}
