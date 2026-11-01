import { useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminSearch from '../../components/admin/AdminSearch'
import DataTable from '../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../components/admin/DetailDialog'
import useAdminActions from '../../hooks/useAdminActions'
import { BanIcon, EyeIcon, FlagIcon, RotateCcwIcon, UserIcon } from '../../components/icons'
import VerificationBadge from '../../components/profile/VerificationBadge'
import RatingStars from '../../components/reviews/RatingStars'
import ActionMenu from '../../components/ui/ActionMenu'
import Alert from '../../components/ui/Alert'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import FilterTabs from '../../components/ui/FilterTabs'
import Select from '../../components/ui/Select'
import StatusPill from '../../components/ui/StatusPill'
import { ACCOUNT_STATUSES } from '../../constants/moderation'
import { CAMPUSES } from '../../constants/product'
import useAdminList from '../../hooks/useAdminList'
import { PATHS } from '../../routes/paths'
import { adminService } from '../../services/admin/adminService'
import { formatDate } from '../../utils/format'

const VERIFICATION_OPTIONS = [
  { value: '', label: 'Any verification' },
  { value: 'VERIFIED', label: 'Verified student' },
  { value: 'EMAIL', label: 'Personal email verified' },
  { value: 'UNVERIFIED', label: 'Email not verified' },
]

function Verification({ user }) {
  if (user.verified || user.emailVerified) return <VerificationBadge user={user} />
  return <span className="text-xs font-medium text-warning">Not verified</span>
}

function AccountStatus({ status }) {
  const config = ACCOUNT_STATUSES[status]
  return <StatusPill tone={config?.tone}>{config?.label ?? status}</StatusPill>
}

function Rating({ rating }) {
  if (!rating?.count) return <span className="text-ink-muted">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <RatingStars value={rating.average} size="sm" />
      <span className="text-ink">{rating.average.toFixed(1)}</span>
      <span className="text-xs text-ink-muted">({rating.count})</span>
    </span>
  )
}

function userActions(user, { onDetails, open }) {
  return [
    { label: 'View details', Icon: EyeIcon, onSelect: () => onDetails(user) },
    { label: 'Public profile', Icon: UserIcon, to: PATHS.user(user.id) },
    user.status === 'SUSPENDED'
      ? { label: 'Reactivate', Icon: RotateCcwIcon, onSelect: () => open('reactivateUser', user) }
      : { label: 'Suspend', Icon: BanIcon, danger: true, onSelect: () => open('suspendUser', user) },
  ]
}

function UserDetailDialog({ user, open, onClose }) {
  return (
    <DetailDialog
      title={user.name}
      subtitle={user.programme}
      status={
        <>
          <AccountStatus status={user.status} />
          <Verification user={user} />
        </>
      }
      onClose={onClose}
      actions={
        <>
          <Link to={PATHS.user(user.id)} className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-medium text-primary hover:bg-primary-soft">
            Public profile
          </Link>
          {user.status === 'SUSPENDED' ? (
            <Button onClick={() => open('reactivateUser', user)}>
              <RotateCcwIcon className="size-4" />
              Reactivate
            </Button>
          ) : (
            <Button variant="danger" onClick={() => open('suspendUser', user)}>
              <BanIcon className="size-4" />
              Suspend
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium text-ink">{user.email}</p>
          <p className="text-ink-muted">{user.emailType === 'UNIVERSITY' ? 'University email (@fpt.edu.vn)' : 'Personal email'}</p>
        </div>
      </div>
      {user.openReports > 0 && (
        <Alert variant="warning" title={`${user.openReports} open report${user.openReports > 1 ? 's' : ''} about this student`}>
          <Link to={`${PATHS.adminReports}?status=OPEN&q=${encodeURIComponent(user.name)}`} className="font-semibold text-primary hover:underline">
            See reports
          </Link>
        </Alert>
      )}
      <DetailList
        items={[
          ['Campus', CAMPUSES[user.campus]?.label],
          ['Member since', formatDate(user.memberSince)],
          ['Listings', user.listingCount],
          ['Rating', <Rating key="rating" rating={user.rating} />],
        ]}
      />
    </DetailDialog>
  )
}

/** Admin › Users: student accounts with verification and status (Figma "Users" tab). */
export default function AdminUsersPage() {
  const list = useAdminList('admin-users', adminService.listUsers, ['status', 'verification'])
  const { open, dialog } = useAdminActions()
  const [detail, setDetail] = useState(null)
  const { params, list: data } = list
  const counts = data?.counts ?? {}

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{row.name}</p>
            <p className="max-w-[14rem] truncate text-xs text-ink-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'campus', header: 'Campus', render: (row) => <span className="text-ink-muted">{CAMPUSES[row.campus]?.label}</span> },
    { key: 'verification', header: 'Verification', render: (row) => <Verification user={row} /> },
    { key: 'listings', header: 'Listings', className: 'text-right tabular-nums', render: (row) => row.listingCount },
    { key: 'rating', header: 'Rating', render: (row) => <Rating rating={row.rating} /> },
    {
      key: 'reports',
      header: 'Reports',
      render: (row) =>
        row.openReports > 0 ? (
          <span className="inline-flex items-center gap-1 text-danger">
            <FlagIcon className="size-3.5" />
            {row.openReports} open
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    { key: 'joined', header: 'Joined', className: 'whitespace-nowrap', render: (row) => <span className="text-ink-muted">{formatDate(row.memberSince)}</span> },
    { key: 'status', header: 'Status', render: (row) => <AccountStatus status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => <ActionMenu label={`Actions for ${row.name}`} heading={row.name} items={userActions(row, { onDetails: setDetail, open })} />,
    },
  ]

  return (
    <>
      <title>Users · UniMarket Admin</title>
      <AdminPageHeader title="Users" description="Student accounts, their verification and reputation. Suspend accounts that break the rules." />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          label="Filter by account status"
          value={params.status}
          onChange={(value) => list.setFilter('status', value)}
          options={[
            { value: '', label: 'All', count: counts.all },
            { value: 'ACTIVE', label: 'Active', count: counts.ACTIVE },
            { value: 'SUSPENDED', label: 'Suspended', count: counts.SUSPENDED },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <AdminSearch label="Search students" placeholder="Name, email or programme" value={params.q} onSearch={list.setSearch} />
          <Select label="Verification" hideLabel name="verification" options={VERIFICATION_OPTIONS} value={params.verification} onChange={(value) => list.setFilter('verification', value)} className="sm:w-52" />
        </div>
      </div>

      <DataTable
        caption="Students"
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error}
        onRetry={list.reload}
        minWidth="58rem"
        emptyTitle="No students match"
        emptyDescription="Try another status, verification or search."
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'students' }}
      />

      {detail && <UserDetailDialog user={detail} open={open} onClose={() => setDetail(null)} />}
      {dialog}
    </>
  )
}
