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

const loadSettlements = (params) =>
  adminBackendApi
    .settlements({ status: params.status || 'PENDING', onHold: params.onHold === 'true' ? true : params.onHold === 'false' ? false : undefined, page: params.page, size: params.pageSize })
    .then(toAdminPage)

/**
 * One seller settlement (docs/ADMIN_API.md §7), shown exactly as stored: items − 3 % commission + full delivery fee.
 * "Release" records a payout made outside UniMarket (once; not while on hold). For sandbox settlements it is a
 * simulated record — confirming the dialog is the explicit acknowledgement (acknowledgeSimulated) — and no money moves.
 */
function SettlementDetail({ orderId, onClose }) {
  const { t } = useTranslation()
  const { data: s, error, isLoading, reload } = useAsyncData(() => adminBackendApi.settlement(orderId), `admin-settlement-${orderId}`)
  const { open, dialog } = useLiveAction()
  const canRelease = s && s.status === 'PENDING' && !s.onHold

  return (
    <DetailDialog
      title={t('Payout for order {code}', { code: `UO-${orderId}` })}
      subtitle={s?.seller?.name}
      status={
        s && (
          <>
            <StatusPill tone={s.status === 'RELEASED' ? 'success' : 'warning'}>{t(s.status)}</StatusPill>
            {s.onHold && <StatusPill tone="danger">{t('On hold')}</StatusPill>}
            <SimulatedTag show={s.sandbox} />
          </>
        )
      }
      onClose={onClose}
      actions={
        canRelease && (
          <Button
            onClick={() =>
              open({
                title: s.sandbox ? 'Record a simulated payout?' : 'Record the payout?',
                message: s.sandbox
                  ? t('Sandbox settlement: this only records that the simulated payout of {amount} was handled. No money is transferred. Confirming acknowledges that it is simulated.', { amount: money(s.amount) })
                  : t('Record that {amount} was paid to the seller outside UniMarket. UniMarket moves no money. This can be done once.', { amount: money(s.amount) }),
                confirmLabel: s.sandbox ? 'Record simulated payout' : 'Record payout',
                reason: { min: 1, max: 100, label: 'Payout reference (up to 100 characters)', placeholder: s.sandbox ? 'e.g. SIM-PAYOUT-2026-0001' : 'e.g. bank transfer reference' },
                doneText: 'The payout was recorded.',
                run: (reference) => adminBackendApi.releaseSettlement(orderId, reference, null, s.sandbox),
                onClose: reload,
              })
            }
          >
            {s.sandbox ? t('Record simulated payout') : t('Record payout')}
          </Button>
        )
      }
    >
      {error ? (
        <ErrorState title={t('Couldn’t load this settlement')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : isLoading ? (
        <LoadingState message={t('Loading settlement…')} />
      ) : (
        <>
          <DetailList
            items={[
              ['Items subtotal', money(s.merchandiseSubtotal)],
              ['UniMarket commission (3 % of items)', `−${money(s.commission)}`],
              ['Delivery fee (passed to the seller)', money(s.shippingFee)],
              ['Seller payout', money(s.amount)],
              ['Created', formatDateTime(s.createdAt)],
              ['Released', s.releasedAt && formatDateTime(s.releasedAt)],
              ['Released by', s.releasedBy?.name],
              ['Payout reference', s.payoutReference],
              ['Record type', s.payoutRecordType && t(s.payoutRecordType)],
            ]}
          />
          {s.payoutNote && <p className="text-xs whitespace-pre-line text-ink-muted">{s.payoutNote}</p>}
          {s.onHold && (
            <Alert variant="warning" title={t('On hold')}>
              {t('The order has an open dispute or an approved refund, so the payout can’t be released.')}
            </Alert>
          )}
        </>
      )}
      {dialog}
    </DetailDialog>
  )
}

/** Admin › Settlements (real API only). Commission is the platform's revenue; payouts are owed to sellers. */
export default function LiveAdminSettlementsPage() {
  const { t } = useTranslation()
  const list = useAdminList('live-admin-settlements', loadSettlements, ['status', 'onHold'])
  const [detailId, setDetailId] = useState(null)
  const { reload } = list
  useEffect(() => onAdminChanged(reload), [reload])
  const columns = [
    { key: 'order', header: 'Order', render: (row) => <span className="font-medium whitespace-nowrap text-ink">UO-{row.orderId}</span> },
    { key: 'seller', header: 'Seller', render: (row) => <span className="text-ink">{row.seller?.name}</span> },
    { key: 'items', header: 'Items', className: 'whitespace-nowrap', render: (row) => money(row.merchandiseSubtotal) },
    { key: 'commission', header: 'Commission', className: 'whitespace-nowrap', render: (row) => money(row.commission) },
    { key: 'fee', header: 'Delivery', className: 'whitespace-nowrap', render: (row) => money(row.shippingFee) },
    { key: 'amount', header: 'Payout', className: 'whitespace-nowrap', render: (row) => <span className="font-semibold text-ink">{money(row.amount)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusPill tone={row.status === 'RELEASED' ? 'success' : 'warning'}>{t(row.status)}</StatusPill>
          {row.onHold && <StatusPill tone="danger">{t('On hold')}</StatusPill>}
          <SimulatedTag show={row.sandbox} />
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      hideHeader: true,
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setDetailId(row.orderId)}>
          <EyeIcon className="size-4" />
          {t('Details')}
        </Button>
      ),
    },
  ]
  const data = list.list
  return (
    <>
      <title>{t('Settlements · UniMarket Admin')}</title>
      <AdminPageHeader
        title={t('Settlements')}
        description={t('Seller payouts of completed orders: items − 3 % commission + the full delivery fee. Recording a payout moves no money; simulated payouts are marked.')}
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          label={t('Filter by settlement status')}
          value={list.params.status || 'PENDING'}
          onChange={(value) => list.setFilter('status', value === 'PENDING' ? '' : value)}
          options={['PENDING', 'RELEASED', 'ALL'].map((value) => ({ value, label: value }))}
        />
        <FilterTabs
          label={t('Filter by hold')}
          value={list.params.onHold}
          onChange={(value) => list.setFilter('onHold', value)}
          options={[
            { value: '', label: 'Any' },
            { value: 'true', label: 'On hold' },
            { value: 'false', label: 'Not on hold' },
          ]}
        />
      </div>
      <DataTable
        caption={t('Settlements')}
        columns={columns}
        rows={data?.items}
        rowKey={(row) => row.orderId}
        isLoading={list.isLoading}
        isRefreshing={list.isRefreshing}
        error={list.error && { message: adminErrorText(list.error) }}
        onRetry={list.reload}
        minWidth="56rem"
        emptyTitle={t('No settlements match')}
        emptyDescription={t('Settlements are created when buyers confirm receipt.')}
        pagination={data && { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, itemLabel: 'settlements' }}
      />
      {detailId && <SettlementDetail orderId={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
