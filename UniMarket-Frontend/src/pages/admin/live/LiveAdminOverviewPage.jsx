import { useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import DashboardStatCard from '../../../components/admin/DashboardStatCard'
import { FlagIcon, PackageIcon, ShoppingBagIcon, UsersIcon, WalletIcon } from '../../../components/icons'
import ErrorState from '../../../components/ui/ErrorState'
import Input from '../../../components/ui/Input'
import useAsyncData from '../../../hooks/useAsyncData'
import { PATHS } from '../../../routes/paths'
import { adminBackendApi, adminErrorText } from '../../../services/admin/adminBackendApi'
import useTranslation from '../../../i18n/useTranslation'
import { money } from './liveAdminFormat'

const n = new Intl.NumberFormat('vi-VN')
const num = (value) => (value == null ? '—' : n.format(value))
const isoDay = (date) => date.toISOString().slice(0, 10)

/** Small labelled table of one dashboard section (every value straight from GET /api/admin/dashboard). */
function Section({ title, rows, link }) {
  const { t } = useTranslation()
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{t(title)}</h2>
        {link && (
          <Link to={link.to} className="text-sm font-medium text-primary hover:underline">
            {t(link.label)}
          </Link>
        )}
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, value, note]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">
              {t(label)}
              {note && <span className="block text-[11px]">{t(note)}</span>}
            </dt>
            <dd className="font-medium whitespace-nowrap text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Admin › Overview with the real API (docs/ADMIN_API.md §9). Period filter in UTC days (default: last 30 days).
 * No growth percentages or trend lines are shown: the API has no history series. Money: commission is platform revenue;
 * buyer totals and payouts are not; sandbox counts show how much comes from simulated payments.
 */
export default function LiveAdminOverviewPage() {
  const { t } = useTranslation()
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 29 * 86_400_000)))
  const [to, setTo] = useState(isoDay(today))
  const valid = from && to && from <= to
  const { data, error, isLoading, reload } = useAsyncData(() => (valid ? adminBackendApi.dashboard(from, to) : Promise.resolve(null)), `live-dashboard-${from}-${to}`)

  const d = data
  const cards = d && [
    { key: 'users', label: 'Students', value: num(d.users.students), note: t('{count} email-verified · {new} new in period', { count: num(d.users.studentAccountsWithEmailVerified), new: num(d.users.newStudentsInPeriod) }), Icon: UsersIcon },
    { key: 'listings', label: 'Public listings', value: num(d.listings.publicAvailable), note: t('{count} awaiting review', { count: num(d.listings.pendingModeration) }), Icon: PackageIcon },
    { key: 'orders', label: 'Completed orders (period)', value: num(d.finance.completedOrders), note: t('{count} placed in period', { count: num(d.orders.placedInPeriod) }), Icon: ShoppingBagIcon },
    { key: 'commission', label: 'Commission revenue (period)', value: money(d.finance.commissionRevenue), note: '3 % of items of completed orders · simulated payments included', Icon: WalletIcon },
  ]

  return (
    <>
      <title>{t('Admin overview · UniMarket')}</title>
      <AdminPageHeader title={t('Overview')} description={t('Live figures from the UniMarket database. Payments, refunds and payouts are simulated in this version.')} />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Input label={t('From (UTC)')} type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="w-44" />
        <Input label={t('To (UTC)')} type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="w-44" />
        {!valid && <p className="text-sm text-danger">{t('Choose a start date before the end date.')}</p>}
      </div>

      {error ? (
        <ErrorState title={t('Couldn’t load statistics')} message={t(adminErrorText(error))} onRetry={reload} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={isLoading || undefined}>
            {isLoading || !d ? [1, 2, 3, 4].map((key) => <div key={key} className="h-36 animate-pulse rounded-2xl bg-subtle" />) : cards.map(({ key, ...card }) => <DashboardStatCard key={key} {...card} />)}
          </div>
          {d && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <Section
                title="Money (completed in period)"
                rows={[
                  ['Items value (GMV)', money(d.finance.grossMerchandiseValue)],
                  ['Delivery fees', money(d.finance.shippingFees), 'passed to sellers, no commission'],
                  ['Paid by buyers', money(d.finance.buyerPaidTotal), 'not platform revenue'],
                  ['Commission revenue', money(d.finance.commissionRevenue), '3 % of items'],
                  ['Owed to sellers', money(d.finance.sellerPayoutTotal)],
                  ['Orders paid in the sandbox', num(d.finance.sandboxOrders), 'simulated payments'],
                ]}
              />
              <Section
                title="Payouts"
                link={{ to: PATHS.adminSettlements, label: 'Open settlements' }}
                rows={[
                  ['Pending payouts', `${num(d.settlements.pendingCount)} · ${money(d.settlements.pendingAmount)}`],
                  ['… of which simulated', money(d.settlements.pendingSandboxAmount)],
                  ['On hold', num(d.settlements.onHoldCount)],
                  ['Recorded in period', num(d.settlements.releasedInPeriodCount)],
                  ['Real transfers recorded', money(d.settlements.releasedRealAmountInPeriod), 'confirmed by an admin'],
                  ['Simulated payout records', money(d.settlements.releasedSandboxAmountInPeriod), 'no money disbursed'],
                ]}
              />
              <Section
                title="Listings"
                link={{ to: PATHS.adminProducts, label: 'Review listings' }}
                rows={[
                  ['Public (available, approved)', num(d.listings.publicAvailable)],
                  ['Awaiting review', num(d.listings.pendingModeration)],
                  ['Blocked', num(d.listings.blocked)],
                  ['Reserved', num(d.listings.reserved)],
                  ['Sold', num(d.listings.sold)],
                  ['Removed', num(d.listings.removed)],
                ]}
              />
              <Section
                title="Orders by status"
                link={{ to: PATHS.adminOrders, label: 'Open orders' }}
                rows={Object.entries(d.orders)
                  .filter(([key]) => key !== 'placedInPeriod')
                  .map(([key, value]) => [key, num(value)])}
              />
              <Section
                title="Accounts"
                link={{ to: PATHS.adminUsers, label: 'Open users' }}
                rows={[
                  ['Students', num(d.users.students)],
                  ['Active students', num(d.users.activeStudents)],
                  ['Suspended', num(d.users.suspended)],
                  ['Closed', num(d.users.closed)],
                  ['Email verified', num(d.users.studentAccountsWithEmailVerified), 'email ownership, not student status'],
                  ['Admins', num(d.users.admins)],
                ]}
              />
              <Section
                title="Trust and promotions"
                rows={[
                  ['Open reports', num(d.reports.open)],
                  ['Reports in review', num(d.reports.reviewing)],
                  ['Open disputes', num(d.disputes.open)],
                  ['Refunds awaiting a reference', num(d.disputes.refundApprovedAwaitingConfirmation)],
                  ['Active featured listings', num(d.promotions.activePaid)],
                  ['Promotion revenue (period)', money(d.promotions.paidRevenueInPeriod), `${num(d.promotions.sandboxPaidInPeriod)} simulated`],
                ]}
              />
            </div>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
            <FlagIcon className="size-3.5" />
            {t('Growth trends are not shown: the API has no history series yet.')}
          </p>
        </>
      )}
    </>
  )
}
