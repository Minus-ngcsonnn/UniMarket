import { useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminSearch from '../../components/admin/AdminSearch'
import DataTable from '../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../components/admin/DetailDialog'
import useAdminActions from '../../hooks/useAdminActions'
import { CheckCircleIcon, EyeIcon, TagIcon, UserIcon, XIcon } from '../../components/icons'
import ActionMenu from '../../components/ui/ActionMenu'
import Button from '../../components/ui/Button'
import FilterTabs from '../../components/ui/FilterTabs'
import Select from '../../components/ui/Select'
import StatusPill from '../../components/ui/StatusPill'
import { REPORT_STATUSES, reportCode, reportReasonLabel } from '../../constants/moderation'
import { listingCode } from '../../constants/product'
import useAdminList from '../../hooks/useAdminList'
import { PATHS } from '../../routes/paths'
import { adminService } from '../../services/admin/adminService'
import { formatDateTime, formatRelativeTime } from '../../utils/format'
import useTranslation from '../../i18n/useTranslation'

const TYPE_OPTIONS = [
  { value: '', label: 'Listings and students' },
  { value: 'LISTING', label: 'Listings' },
  { value: 'USER', label: 'Students' },
]

function ReportStatus({ status }) {
  const config = REPORT_STATUSES[status]
  return <StatusPill tone={config?.tone}>{config?.label ?? status}</StatusPill>
}

/** Where to handle the reported listing/student (moderation happens on their own admin page). */
function targetLink(target) {
  return target.type === 'LISTING' ? `${PATHS.adminProducts}?q=${listingCode(target.id)}` : `${PATHS.adminUsers}?q=${encodeURIComponent(target.label)}`
}

function Target({ target }) {
  const Icon = target.type === 'LISTING' ? TagIcon : UserIcon
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <div className="min-w-0">
        <p className="max-w-[14rem] truncate font-medium text-ink">{target.label}</p>
        <p className="text-xs text-ink-muted">{target.type === 'LISTING' ? `${listingCode(target.id)} · by ${target.ownerName}` : 'Student account'}</p>
      </div>
    </div>
  )
}

function reportActions(report, { onDetails, open }) {
  return [
    { label: 'View details', Icon: EyeIcon, onSelect: () => onDetails(report) },
    { label: report.target.type === 'LISTING' ? 'Go to listing' : 'Go to student', Icon: report.target.type === 'LISTING' ? TagIcon : UserIcon, to: targetLink(report.target) },
    ...(report.status === 'OPEN'
      ? [
          { label: 'Resolve', Icon: CheckCircleIcon, onSelect: () => open('resolveReport', report) },
          { label: 'Dismiss', Icon: XIcon, danger: true, onSelect: () => open('dismissReport', report) },
        ]
      : []),
  ]
}

function ReportDetailDialog({ report, open, onClose }) {
  const { t } = useTranslation()
  return (
    <DetailDialog
      title={`${reportCode(report.id)} · ${t(reportReasonLabel(report.reason))}`}
      subtitle={t('Reported {time} by {name}', { time: formatRelativeTime(report.createdAt).toLowerCase(), name: report.reporter?.name ?? t('a former student') })}
      status={<ReportStatus status={report.status} />}
      onClose={onClose}
      actions={
        <>
          <Link to={targetLink(report.target)} className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-medium text-primary hover:bg-primary-soft">
            {report.target.type === 'LISTING' ? 'Go to listing' : 'Go to student'}
          </Link>
          {report.status === 'OPEN' && (
            <>
              <Button variant="secondary" onClick={() => open('dismissReport', report)}>
                {t("Dismiss")}
              </Button>
              <Button onClick={() => open('resolveReport', report)}>{t("Resolve")}</Button>
            </>
          )}
        </>
      }
    >
      <div className="rounded-control bg-subtle p-4">
        <Target target={report.target} />
      </div>
      <div>
        <p className="text-xs text-ink-muted">{t("What the reporter said")}</p>
        <p className="mt-1 text-sm whitespace-pre-line text-ink">{report.details || 'No details given.'}</p>
      </div>
      <DetailList
        items={[
          ['Reason', t(reportReasonLabel(report.reason))],
          ['Reported', formatDateTime(report.createdAt)],
          ['Reporter', report.reporter?.name],
          ['Outcome', report.resolution],
        ]}
      />
    </DetailDialog>
  )
}

/** Admin › Violation reports (Business Plan: admins handle reports about listings and students). */
export default function AdminReportsPage() {
  const { t } = useTranslation()
  const list = useAdminList('admin-reports', adminService.listReports, ['status', 'targetType'])
  const { open, dialog } = useAdminActions()
  const [detail, setDetail] = useState(null)
  const { params, list: data } = list
  const counts = data?.counts ?? {}

  const columns = [
    {
      key: 'report',
      header: 'Report',
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{t(reportReasonLabel(row.reason))}</p>
          <p className="text-xs text-ink-muted">{reportCode(row.id)}</p>
        </div>
      ),
    },
    { key: 'target', header: 'Reported', render: (row) => <Target target={row.target} /> },
    { key: 'reporter', header: 'Reporter', render: (row) => <span className="text-ink">{row.reporter?.name}</span> },
    { key: 'created', header: 'Received', className: 'whitespace-nowrap', render: (row) => <span className="text-ink-muted">{formatRelativeTime(row.createdAt)}</span> },
    { key: 'status', header: 'Status', render: (row) => <ReportStatus status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => <ActionMenu label={`Actions for report ${reportCode(row.id)}`} heading={`Report ${reportCode(row.id)}`} items={reportActions(row, { onDetails: setDetail, open })} />,
    },
  ]

  return (
    <>
      <title>{t("Violation reports · UniMarket Admin")}</title>
      <AdminPageHeader title={t("Violation reports")} description={t("Reports from students about listings and accounts. Handle open reports first, oldest first.")} />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          label={t("Filter by report status")}
          value={params.status}
          onChange={(value) => list.setFilter('status', value)}
          options={[{ value: '', label: 'All', count: counts.all }, ...Object.entries(REPORT_STATUSES).map(([key, config]) => ({ value: key, label: config.label, count: counts[key] }))]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <AdminSearch label={t("Search reports")} placeholder={t("Listing, student or RP code")} value={params.q} onSearch={list.setSearch} />
          <Select label={t("Reported")} hideLabel name="targetType" options={TYPE_OPTIONS} value={params.targetType} onChange={(value) => list.setFilter('targetType', value)} className="sm:w-52" />
        </div>
      </div>

      <DataTable
        caption="Violation reports"
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error}
        onRetry={list.reload}
        emptyTitle={t("No reports here")}
        emptyDescription={t("Nothing matches this status or search.")}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'reports' }}
      />

      {detail && <ReportDetailDialog report={detail} open={open} onClose={() => setDetail(null)} />}
      {dialog}
    </>
  )
}
