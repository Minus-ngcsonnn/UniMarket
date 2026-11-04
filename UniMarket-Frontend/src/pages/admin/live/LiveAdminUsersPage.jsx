import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import AdminSearch from '../../../components/admin/AdminSearch'
import DataTable from '../../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../../components/admin/DetailDialog'
import { EyeIcon } from '../../../components/icons'
import Button from '../../../components/ui/Button'
import ErrorState from '../../../components/ui/ErrorState'
import FilterTabs from '../../../components/ui/FilterTabs'
import LoadingState from '../../../components/ui/LoadingState'
import Select from '../../../components/ui/Select'
import StatusPill from '../../../components/ui/StatusPill'
import useAdminList from '../../../hooks/useAdminList'
import useAsyncData from '../../../hooks/useAsyncData'
import useSession from '../../../hooks/useSession'
import { PATHS } from '../../../routes/paths'
import { adminBackendApi, adminErrorText, onAdminChanged } from '../../../services/admin/adminBackendApi'
import { formatDate, formatDateTime } from '../../../utils/format'
import useTranslation from '../../../i18n/useTranslation'
import { HistoryList } from './liveAdmin'
import { toAdminPage } from './liveAdminFormat'
import useLiveAction from './useLiveAction'

const STATUS_TONE = { ACTIVE: 'success', SUSPENDED: 'danger', CLOSED: 'neutral' }
const loadUsers = (params) =>
  adminBackendApi.users({ q: params.q, status: params.status, role: params.role || 'ALL', page: params.page, size: params.pageSize }).then(toAdminPage)

/** University / campus as stored: official campus, or a self-declared name (never a verified-student claim). */
function affiliation(user, t) {
  if (user.campus?.name) return user.campus.name
  if (user.declaredUniversity) return t('{name} (self-declared)', { name: user.declaredUniversity })
  return '—'
}

/** Account detail with the admin history; suspend / reactivate students (never admins, never yourself). */
function UserDetail({ id, onClose }) {
  const { t } = useTranslation()
  const me = useSession().user
  const { data: user, error, isLoading, reload } = useAsyncData(() => adminBackendApi.user(id), `admin-user-${id}`)
  const { open, dialog } = useLiveAction()
  const isStudent = user?.role === 'STUDENT'
  const isSelf = user && me && user.id === me.id

  return (
    <DetailDialog
      title={user?.fullName ?? t('Account')}
      subtitle={user?.email}
      status={
        user && (
          <>
            <StatusPill tone={STATUS_TONE[user.status] ?? 'neutral'}>{t(user.status)}</StatusPill>
            <StatusPill tone="primary">{t(user.role)}</StatusPill>
            <StatusPill tone={user.emailVerified ? 'success' : 'warning'}>{user.emailVerified ? t('Email verified') : t('Email not verified')}</StatusPill>
          </>
        )
      }
      onClose={onClose}
      actions={
        user &&
        isStudent &&
        !isSelf && (
          <>
            <Link to={PATHS.user(user.id)} className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-medium text-primary hover:bg-primary-soft">
              {t('Public profile')}
            </Link>
            {user.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                className="text-danger"
                onClick={() =>
                  open({
                    title: t('Suspend {name}?', { name: user.fullName }),
                    message: 'They can’t sign in, buy or sell; their listings leave the marketplace. Orders, payments and reviews are kept.',
                    confirmLabel: 'Suspend account',
                    tone: 'danger',
                    reason: { max: 1000, label: 'Reason (recorded in the audit log)', placeholder: 'e.g. Asked buyers to pay outside UniMarket.', hint: 'Refer to the rule that was broken.' },
                    doneText: 'The account is suspended.',
                    run: (reason) => adminBackendApi.suspendUser(user.id, reason),
                    onClose: reload,
                  })
                }
              >
                {t('Suspend account')}
              </Button>
            )}
            {user.status === 'SUSPENDED' && (
              <Button
                onClick={() =>
                  open({
                    title: t('Reactivate {name}?', { name: user.fullName }),
                    message: 'They will be able to sign in, buy and sell again.',
                    confirmLabel: 'Reactivate account',
                    reason: { optional: true, max: 1000, label: 'Reason (optional, recorded in the audit log)', placeholder: 'e.g. Appeal accepted after review.' },
                    doneText: 'The account is active again.',
                    run: (reason) => adminBackendApi.reactivateUser(user.id, reason),
                    onClose: reload,
                  })
                }
              >
                {t('Reactivate account')}
              </Button>
            )}
          </>
        )
      }
    >
      {error ? (
        <ErrorState title={t('Couldn’t load this account')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : isLoading ? (
        <LoadingState message={t('Loading account…')} />
      ) : (
        <>
          <DetailList
            items={[
              ['University / campus', affiliation(user, t)],
              ['Member since', formatDate(user.createdAt)],
              ['Listings', user.listingCount],
              ['Orders as buyer', user.ordersAsBuyer],
              ['Orders as seller', user.ordersAsSeller],
              ['Rating', user.ratingCount ? `${Number(user.ratingAverage).toFixed(1)} (${user.ratingCount})` : t('No reviews yet')],
              ['Open reports', user.openReports],
              ['Shared contact', user.showContact ? [user.phone, user.zaloUrl].filter(Boolean).join(' · ') || '—' : t('Not shared (private)')],
            ]}
          />
          <p className="text-xs text-ink-muted">{t('“Email verified” only means the address was confirmed with a code. It is not a student-status check.')}</p>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('Admin history')}</h3>
            <HistoryList events={user.history} />
          </section>
        </>
      )}
      {dialog}
    </DetailDialog>
  )
}

/** Admin › Users with the real API (no role changes exist: registration always creates students). */
export default function LiveAdminUsersPage() {
  const { t } = useTranslation()
  const list = useAdminList('live-admin-users', loadUsers, ['status', 'role'])
  const [detailId, setDetailId] = useState(null)
  const { reload } = list
  useEffect(() => onAdminChanged(reload), [reload])

  const columns = [
    {
      key: 'user',
      header: 'Account',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.fullName}</p>
          <p className="text-xs text-ink-muted">{row.email}</p>
        </div>
      ),
    },
    { key: 'affiliation', header: 'University / campus', render: (row) => <span className="text-ink-muted">{affiliation(row, t)}</span> },
    { key: 'role', header: 'Role', render: (row) => t(row.role) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill tone={STATUS_TONE[row.status] ?? 'neutral'}>{t(row.status)}</StatusPill>
          {!row.emailVerified && <span className="text-xs text-ink-muted">{t('Email not verified')}</span>}
        </div>
      ),
    },
    { key: 'activity', header: 'Listings · orders', render: (row) => `${row.listingCount} · ${row.ordersAsBuyer + row.ordersAsSeller}` },
    { key: 'joined', header: 'Joined', className: 'whitespace-nowrap', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setDetailId(row.id)}>
          <EyeIcon className="size-4" />
          {t('Details')}
        </Button>
      ),
    },
  ]
  const data = list.list
  return (
    <>
      <title>{t('Users · UniMarket Admin')}</title>
      <AdminPageHeader title={t('Users')} description={t('Student and admin accounts. Suspending a student hides their listings and ends their sessions; history is kept.')} />
      <FilterTabs
        label={t('Filter by account status')}
        value={list.params.status}
        onChange={(value) => list.setFilter('status', value)}
        options={[
          { value: '', label: 'All' },
          { value: 'ACTIVE', label: 'ACTIVE' },
          { value: 'SUSPENDED', label: 'SUSPENDED' },
          { value: 'CLOSED', label: 'CLOSED' },
        ]}
        className="mb-4"
      />
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="w-full md:max-w-xs">
          <AdminSearch label={t('Search users')} placeholder={t('Search by name or email')} value={list.params.q} onSearch={list.setSearch} />
        </div>
        <Select
          label={t('Role')}
          hideLabel
          name="role"
          options={[
            { value: '', label: 'All roles' },
            { value: 'STUDENT', label: 'STUDENT' },
            { value: 'ADMIN', label: 'ADMIN' },
          ]}
          value={list.params.role}
          onChange={(value) => list.setFilter('role', value)}
          className="md:w-44"
        />
      </div>
      <DataTable
        caption={t('Accounts')}
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error && { message: adminErrorText(list.error) }}
        onRetry={list.reload}
        minWidth="56rem"
        emptyTitle={t('No accounts match')}
        emptyDescription={t('Try another status or search.')}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'accounts' }}
      />
      {detailId && <UserDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
