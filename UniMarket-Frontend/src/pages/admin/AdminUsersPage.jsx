import AdminPageHeader from '../../components/admin/AdminPageHeader'
import UsersPanel from '../../components/admin/UsersPanel'
import FilterTabs from '../../components/ui/FilterTabs'
import useAdminList from '../../hooks/useAdminList'
import { adminService } from '../../services/admin/adminService'
import useTranslation from '../../i18n/useTranslation'

/** Admin › Users: student accounts with verification and status (Figma "Users" tab). */
export default function AdminUsersPage() {
  const { t } = useTranslation()
  const list = useAdminList('admin-users', adminService.listUsers, ['status', 'verification'])
  const counts = list.list?.counts ?? {}

  return (
    <>
      <title>{t("Users · UniMarket Admin")}</title>
      <AdminPageHeader title={t("Users")} description={t("Student accounts, their verification and reputation. Suspend accounts that break the rules.")} />
      <FilterTabs
        label={t("Filter by account status")}
        value={list.params.status}
        onChange={(value) => list.setFilter('status', value)}
        options={[
          { value: '', label: 'All', count: counts.all },
          { value: 'ACTIVE', label: 'Active', count: counts.ACTIVE },
          { value: 'SUSPENDED', label: 'Suspended', count: counts.SUSPENDED },
        ]}
        className="mb-4"
      />
      <UsersPanel list={list} showStatusFilter={false} />
    </>
  )
}
