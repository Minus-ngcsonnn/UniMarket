import { useEffect, useState } from 'react'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import DataTable from '../../../components/admin/DataTable'
import DetailDialog, { DetailList } from '../../../components/admin/DetailDialog'
import { EyeIcon } from '../../../components/icons'
import Alert from '../../../components/ui/Alert'
import Button from '../../../components/ui/Button'
import ErrorState from '../../../components/ui/ErrorState'
import FilterTabs from '../../../components/ui/FilterTabs'
import LoadingState from '../../../components/ui/LoadingState'
import StatusPill from '../../../components/ui/StatusPill'
import useAdminList from '../../../hooks/useAdminList'
import useAsyncData from '../../../hooks/useAsyncData'
import { adminBackendApi, adminErrorText, onAdminChanged } from '../../../services/admin/adminBackendApi'
import { formatDateTime } from '../../../utils/format'
import useTranslation from '../../../i18n/useTranslation'
import { SimulatedTag } from './liveAdmin'
import { money, toAdminPage } from './liveAdminFormat'
import useLiveAction from './useLiveAction'

const loadDisputes = (params) => adminBackendApi.disputes({ status: params.status || 'OPEN', page: params.page, size: params.pageSize }).then(toAdminPage)

/**
 * One dispute (docs/ADMIN_API.md §6). Resolve with NO_REFUND or REFUND_APPROVED (a decision only: UniMarket never
 * executes a refund). After REFUND_APPROVED an admin records the reference of a refund made outside UniMarket — for
 * sandbox orders it is a simulated record and no money exists. While open, receipt confirmation and payout are blocked.
 */
function DisputeDetail({ id, onClose }) {
  const { t } = useTranslation()
  const { data: dispute, error, isLoading, reload } = useAsyncData(() => adminBackendApi.dispute(id), `admin-dispute-${id}`)
  const { open, dialog } = useLiveAction()

  const resolve = (decision) =>
    open({
      title: decision === 'REFUND_APPROVED' ? 'Approve a refund?' : 'Close without refund?',
      message:
        decision === 'REFUND_APPROVED'
          ? 'This records the decision only: UniMarket does not move money. The order, listings and payment stay as they are; the seller payout stays on hold. Record the refund reference afterwards.'
          : 'The dispute is closed. Completion and the seller payout are no longer blocked by it.',
      confirmLabel: decision === 'REFUND_APPROVED' ? 'Approve refund (decision)' : 'Close without refund',
      tone: decision === 'REFUND_APPROVED' ? 'danger' : 'primary',
      reason: { max: 2000, label: 'Resolution (both sides see it)', placeholder: 'e.g. Photos confirm the item arrived damaged.' },
      doneText: 'The dispute is resolved.',
      run: (resolution) => adminBackendApi.resolveDispute(dispute.id, decision, resolution),
      onClose: reload,
    })

  return (
    <DetailDialog
      title={dispute ? t('Dispute on order {code}', { code: `UO-${dispute.orderId}` }) : t('Dispute')}
      subtitle={dispute ? `${dispute.buyer?.name} ↔ ${dispute.seller?.name} · ${formatDateTime(dispute.createdAt)}` : undefined}
      status={
        dispute && (
          <>
            <StatusPill tone={dispute.status === 'OPEN' ? 'warning' : 'success'}>{t(dispute.status)}</StatusPill>
            {dispute.decision && <StatusPill tone="primary">{t(dispute.decision)}</StatusPill>}
            <SimulatedTag show={dispute.sandbox} />
          </>
        )
      }
      onClose={onClose}
      actions={
        dispute &&
        (dispute.status === 'OPEN' ? (
          <>
            <Button variant="secondary" className="text-danger" onClick={() => resolve('REFUND_APPROVED')}>
              {t('Approve refund')}
            </Button>
            <Button onClick={() => resolve('NO_REFUND')}>{t('No refund')}</Button>
          </>
        ) : (
          dispute.decision === 'REFUND_APPROVED' &&
          !dispute.refundConfirmedAt && (
            <Button
              onClick={() =>
                open({
                  title: 'Record the refund reference?',
                  message: dispute.sandbox
                    ? 'Sandbox order: no real money exists. Record a simulated reference to close the refund (once only).'
                    : 'Record the reference of the refund you made outside UniMarket (once only). UniMarket moves no money.',
                  confirmLabel: 'Record refund reference',
                  reason: { min: 1, max: 100, label: 'Refund reference (up to 100 characters)', placeholder: dispute.sandbox ? 'e.g. SIM-REFUND-2026-0001' : 'e.g. bank transfer reference' },
                  doneText: 'The refund reference was recorded.',
                  run: (reference) => adminBackendApi.confirmRefund(dispute.id, reference),
                  onClose: reload,
                })
              }
            >
              {t('Record refund reference')}
            </Button>
          )
        ))
      }
    >
      {error ? (
        <ErrorState title={t('Couldn’t load this dispute')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : isLoading ? (
        <LoadingState message={t('Loading dispute…')} />
      ) : (
        <>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink">{t('Reason given by {name}', { name: dispute.opener?.name ?? t(dispute.openedBy) })}</h3>
            <p className="rounded-control bg-subtle px-3 py-2 text-sm whitespace-pre-line text-ink">{dispute.reason}</p>
          </section>
          <DetailList
            items={[
              ['Order status', t(dispute.orderStatus)],
              ['Order total', money(dispute.orderTotal)],
              ['Opened by', t(dispute.openedBy)],
              ['Resolved by', dispute.resolvedBy?.name],
              ['Resolved', dispute.resolvedAt && formatDateTime(dispute.resolvedAt)],
              ['Refund reference', dispute.refundReference],
              ['Refund recorded', dispute.refundConfirmedAt && formatDateTime(dispute.refundConfirmedAt)],
            ]}
          />
          {dispute.resolution && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-ink">{t('Resolution')}</h3>
              <p className="text-sm whitespace-pre-line text-ink-muted">{dispute.resolution}</p>
            </section>
          )}
          {dispute.sandbox && (
            <Alert variant="info" title={t('Simulated payment')}>
              {t('This order was paid with the payment simulator. No money was charged, so no real refund exists.')}
            </Alert>
          )}
        </>
      )}
      {dialog}
    </DetailDialog>
  )
}

/** Admin › Disputes (real API only). */
export default function LiveAdminDisputesPage() {
  const { t } = useTranslation()
  const list = useAdminList('live-admin-disputes', loadDisputes, ['status'])
  const [detailId, setDetailId] = useState(null)
  const { reload } = list
  useEffect(() => onAdminChanged(reload), [reload])
  const columns = [
    { key: 'order', header: 'Order', render: (row) => <span className="font-medium whitespace-nowrap text-ink">UO-{row.orderId}</span> },
    { key: 'people', header: 'Buyer ↔ seller', render: (row) => <span className="text-ink-muted">{`${row.buyer?.name} ↔ ${row.seller?.name}`}</span> },
    { key: 'reason', header: 'Reason', render: (row) => <span className="line-clamp-2 max-w-[18rem] text-ink">{row.reason}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill tone={row.status === 'OPEN' ? 'warning' : 'success'}>{t(row.status)}</StatusPill>
          {row.decision && <span className="text-xs text-ink-muted">{t(row.decision)}</span>}
        </div>
      ),
    },
    { key: 'total', header: 'Order total', className: 'whitespace-nowrap', render: (row) => money(row.orderTotal) },
    { key: 'created', header: 'Opened', className: 'whitespace-nowrap', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant={row.status === 'OPEN' ? 'primary' : 'secondary'} onClick={() => setDetailId(row.id)}>
          <EyeIcon className="size-4" />
          {row.status === 'OPEN' ? t('Review') : t('Details')}
        </Button>
      ),
    },
  ]
  const data = list.list
  return (
    <>
      <title>{t('Disputes · UniMarket Admin')}</title>
      <AdminPageHeader title={t('Disputes')} description={t('Problems reported on paid orders. A decision never moves money; refunds are recorded after they were made outside UniMarket.')} />
      <FilterTabs
        label={t('Filter by dispute status')}
        value={list.params.status || 'OPEN'}
        onChange={(value) => list.setFilter('status', value === 'OPEN' ? '' : value)}
        options={['OPEN', 'RESOLVED', 'ALL'].map((value) => ({ value, label: value }))}
        className="mb-4"
      />
      <DataTable
        caption={t('Disputes')}
        columns={columns}
        rows={data?.items}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error && { message: adminErrorText(list.error) }}
        onRetry={list.reload}
        minWidth="52rem"
        emptyTitle={t('No disputes')}
        emptyDescription={t('Disputes opened by buyers or sellers appear here.')}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'disputes' }}
      />
      {detailId && <DisputeDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
