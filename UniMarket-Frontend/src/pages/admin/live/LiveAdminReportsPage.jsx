import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import DataTable from '../../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../../components/admin/DetailDialog'
import { EyeIcon } from '../../../components/icons'
import Button from '../../../components/ui/Button'
import ErrorState from '../../../components/ui/ErrorState'
import FilterTabs from '../../../components/ui/FilterTabs'
import LoadingState from '../../../components/ui/LoadingState'
import Select from '../../../components/ui/Select'
import StatusPill from '../../../components/ui/StatusPill'
import { reportReasonLabel } from '../../../constants/moderation'
import useAdminList from '../../../hooks/useAdminList'
import useAsyncData from '../../../hooks/useAsyncData'
import { PATHS } from '../../../routes/paths'
import { adminBackendApi, adminErrorText, onAdminChanged, runAdminAction } from '../../../services/admin/adminBackendApi'
import { formatDateTime } from '../../../utils/format'
import useTranslation from '../../../i18n/useTranslation'
import { toAdminPage } from './liveAdminFormat'
import useLiveAction from './useLiveAction'

const TONE = { OPEN: 'warning', REVIEWING: 'primary', RESOLVED: 'success', DISMISSED: 'neutral' }
const loadReports = (params) =>
  adminBackendApi.reports({ status: params.status || 'ACTIVE', targetType: params.targetType, page: params.page, size: params.pageSize }).then(toAdminPage)

/**
 * One report: target, reason and details (plain text), reporter (admins only). Open → Reviewing → Resolved / Dismissed.
 * A decision is a record only: blocking the listing or suspending the account are separate actions.
 */
function ReportDetail({ id, onClose }) {
  const { t } = useTranslation()
  const { data: report, error, isLoading, reload } = useAsyncData(() => adminBackendApi.report(id), `admin-report-${id}`)
  const { open, dialog } = useLiveAction()
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState(null)
  const isOpen = report && ['OPEN', 'REVIEWING'].includes(report.status)

  async function startReview() {
    setWorking(true)
    setActionError(null)
    try {
      await runAdminAction(() => adminBackendApi.reviewReport(report.id))
      reload()
    } catch (reviewError) {
      setActionError(reviewError.message)
    } finally {
      setWorking(false)
    }
  }

  const targetLink = report && (report.target?.type === 'LISTING' ? PATHS.product(report.target.id) : PATHS.user(report.target?.id))
  return (
    <DetailDialog
      title={report ? t('Report {code}', { code: report.code }) : t('Report')}
      subtitle={report ? `${t(report.targetType)} · ${formatDateTime(report.createdAt)}` : undefined}
      status={report && <StatusPill tone={TONE[report.status] ?? 'neutral'}>{t(report.status)}</StatusPill>}
      onClose={onClose}
      actions={
        isOpen && (
          <>
            {report.status === 'OPEN' && (
              <Button variant="secondary" onClick={startReview} loading={working}>
                {t('Start review')}
              </Button>
            )}
            <Button
              variant="secondary"
              className="text-danger"
              onClick={() =>
                open({
                  title: t('Dismiss {code}?', { code: report.code }),
                  message: 'Use this when no rule was broken. The report is closed without action.',
                  confirmLabel: 'Dismiss report',
                  tone: 'danger',
                  reason: { max: 2000, label: 'Why no action is needed', placeholder: 'e.g. The item is allowed on UniMarket.' },
                  doneText: 'The report is dismissed.',
                  run: (resolution) => adminBackendApi.dismissReport(report.id, resolution),
                  onClose: reload,
                })
              }
            >
              {t('Dismiss')}
            </Button>
            <Button
              onClick={() =>
                open({
                  title: t('Resolve {code}?', { code: report.code }),
                  message: 'Take action on the listing or account first (block, remove or suspend), then record what you did.',
                  confirmLabel: 'Mark as resolved',
                  reason: { max: 2000, label: 'Action taken', placeholder: 'e.g. Listing blocked and seller warned.' },
                  doneText: 'The report is resolved.',
                  run: (resolution) => adminBackendApi.resolveReport(report.id, resolution),
                  onClose: reload,
                })
              }
            >
              {t('Resolve')}
            </Button>
          </>
        )
      }
    >
      {error ? (
        <ErrorState title={t('Couldn’t load this report')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : isLoading ? (
        <LoadingState message={t('Loading report…')} />
      ) : (
        <>
          {actionError && <p className="text-sm text-danger">{t(actionError)}</p>}
          <DetailList
            items={[
              ['Target', report.target ? <Link to={targetLink} className="text-primary hover:underline">{report.target.label}</Link> : '—'],
              ['Target status', report.target?.status],
              ['Owner', report.target?.owner?.name],
              ['Reason', t(reportReasonLabel(report.reasonCode))],
              ['Reported by', report.reporter?.name],
              ['Resolved', report.resolvedAt && formatDateTime(report.resolvedAt)],
            ]}
          />
          {report.details && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-ink">{t('Details from the reporter')}</h3>
              <p className="rounded-control bg-subtle px-3 py-2 text-sm whitespace-pre-line text-ink">{report.details}</p>
            </section>
          )}
          {report.resolution && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-ink">{t('Decision')}</h3>
              <p className="text-sm whitespace-pre-line text-ink-muted">{report.resolution}</p>
            </section>
          )}
        </>
      )}
      {dialog}
    </DetailDialog>
  )
}

/** Admin › Violation reports with the real API (listings and student accounts). */
export default function LiveAdminReportsPage() {
  const { t } = useTranslation()
  const list = useAdminList('live-admin-reports', loadReports, ['status', 'targetType'])
  const [detailId, setDetailId] = useState(null)
  const { reload } = list
  useEffect(() => onAdminChanged(reload), [reload])
  const columns = [
    { key: 'code', header: 'Report', render: (row) => <span className="font-medium whitespace-nowrap text-ink">{row.code}</span> },
    {
      key: 'target',
      header: 'Target',
      render: (row) => (
        <div className="min-w-0">
          <p className="max-w-[16rem] truncate text-ink">{row.target?.label}</p>
          <p className="text-xs text-ink-muted">{t(row.targetType)}</p>
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', render: (row) => <span className="text-ink-muted">{t(reportReasonLabel(row.reasonCode))}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusPill tone={TONE[row.status] ?? 'neutral'}>{t(row.status)}</StatusPill> },
    { key: 'created', header: 'Reported', className: 'whitespace-nowrap', render: (row) => formatDateTime(row.createdAt) },
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
      <title>{t('Violation reports · UniMarket Admin')}</title>
      <AdminPageHeader title={t('Violation reports')} description={t('Reports from students about listings and accounts. Reporters are never shown to the reported person.')} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          label={t('Filter by report status')}
          value={list.params.status || 'ACTIVE'}
          onChange={(value) => list.setFilter('status', value === 'ACTIVE' ? '' : value)}
          options={['ACTIVE', 'OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED', 'ALL'].map((value) => ({ value, label: value === 'ACTIVE' ? 'Open and reviewing' : value }))}
        />
        <Select
          label={t('Target')}
          hideLabel
          name="targetType"
          options={[
            { value: '', label: 'Listings and accounts' },
            { value: 'LISTING', label: 'LISTING' },
            { value: 'USER', label: 'USER' },
          ]}
          value={list.params.targetType}
          onChange={(value) => list.setFilter('targetType', value)}
          className="md:w-52"
        />
      </div>
      <DataTable
        caption={t('Reports')}
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error && { message: adminErrorText(list.error) }}
        onRetry={list.reload}
        minWidth="52rem"
        emptyTitle={t('No reports match')}
        emptyDescription={t('Try another status.')}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'reports' }}
      />
      {detailId && <ReportDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
