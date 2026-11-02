import { Link } from 'react-router'
import useMenu from '../../hooks/useMenu'
import useOrderAttention from '../../hooks/useOrderAttention'
import useSaved from '../../hooks/useSaved'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { BadgeCheckIcon, ChevronDownIcon, ChevronRightIcon, HeartIcon, LayoutDashboardIcon, LogOutIcon, MessageCircleIcon, PackageIcon, ShoppingCartIcon, SettingsIcon, StarIcon, StoreIcon, TagIcon, UserIcon } from '../icons'
import Avatar from '../ui/Avatar'

/** One number in the compact summary row. */
function Stat({ value, label, title }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1" title={title}>
      <dd className="flex items-center gap-1 text-[15px] font-semibold text-ink tabular-nums">{value}</dd>
      <dt className="text-[11px] text-ink-muted">{label}</dt>
    </div>
  )
}

/**
 * Account drop-down from the approved header: who is signed in, a compact summary from their own
 * data (rating, listings, saved, orders) and the buyer/seller pages. In sample-data mode the account is
 * the demo student and is labelled as such; "Sign out" only switches the header to the guest view.
 *
 * @param {object} profile the signed-in student's profile (with rating and stats)
 * @param {boolean} isDemo sample-data mode
 * @param {() => void} onSignOut
 */
export default function AccountMenu({ profile, isDemo, onSignOut }) {
  const { t } = useTranslation()
  const attention = useOrderAttention()
  const saved = useSaved()
  const { isOpen, close, containerRef, triggerRef, toggle, onTriggerKeyDown, onMenuKeyDown, itemRef } = useMenu()

  const isSeller = profile.stats.activeListings > 0 || profile.stats.completedSales > 0
  const todo = (count) => (count > 0 ? t('account.toDo', { count }) : null)
  const groups = [
    [
      { label: t('account.profile'), Icon: UserIcon, to: PATHS.profile },
      { label: t('account.myListings'), Icon: TagIcon, to: PATHS.myListings },
      { label: t('account.myOrders'), Icon: PackageIcon, to: PATHS.orders, badge: todo(attention.buyer) },
      { label: t('account.mySales'), Icon: ShoppingCartIcon, to: PATHS.sales, badge: todo(attention.seller) },
      { label: t('account.favorites'), Icon: HeartIcon, to: PATHS.saved },
      { label: t('account.messages'), Icon: MessageCircleIcon, to: PATHS.messages },
    ],
    [
      { label: t('account.shop'), Icon: StoreIcon, to: PATHS.shop },
      { label: t('account.settings'), Icon: SettingsIcon, to: PATHS.settings },
    ],
    // No admin sign-in exists yet; the demo workspace is reachable from the demo account only.
    ...(isDemo ? [[{ label: t('account.admin'), Icon: LayoutDashboardIcon, to: PATHS.admin }]] : []),
  ]
  let index = 0

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={attention.total ? t('account.menuWithTodo', { count: attention.total }) : t('account.menu')}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className={`relative flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-subtle sm:pr-1.5 ${isOpen ? 'bg-subtle' : ''}`}
      >
        <Avatar name={profile.name} size="sm" className="size-9" />
        <ChevronDownIcon className="hidden size-4 text-ink-muted sm:block" />
        {attention.total > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 left-6 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold text-ink ring-2 ring-canvas">
            {attention.total}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t('account.menu')}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card border border-line bg-surface shadow-pop"
        >
          <div className="flex items-start gap-3 border-b border-line p-4">
            <Avatar name={profile.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate font-semibold text-ink">
                {profile.name}
                {profile.verified && (
                  <>
                    <BadgeCheckIcon className="size-4 shrink-0 text-primary" />
                    <span className="sr-only">{t('account.verified')}</span>
                  </>
                )}
              </p>
              <p className="text-xs text-ink-muted">{isDemo ? t('account.demoAccount') : profile.programme}</p>
            </div>
            {isSeller && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-xs font-medium text-primary">
                <StoreIcon className="size-3.5" />
                {t('account.seller')}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-4 border-b border-line py-3">
            <Stat
              label={t('account.rating')}
              title={profile.rating.count ? undefined : t('account.noRating')}
              value={
                profile.rating.count ? (
                  <>
                    <StarIcon className="size-3.5 text-amber-400" fill="currentColor" stroke="none" />
                    {profile.rating.average.toFixed(1)}
                  </>
                ) : (
                  '–'
                )
              }
            />
            <Stat label={t('account.listings')} value={profile.stats.activeListings} />
            <Stat label={t('account.saved')} value={saved.count} />
            <Stat label={t('account.orders')} title={t('account.ordersHint')} value={profile.stats.completedSales + profile.stats.completedPurchases} />
          </dl>

          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="border-b border-line p-1.5">
              {group.map(({ label, Icon, to, badge }) => (
                <Link
                  key={to}
                  ref={itemRef(index++)}
                  to={to}
                  role="menuitem"
                  onClick={() => close({ restoreFocus: false })}
                  className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-ink hover:bg-subtle focus:bg-subtle focus:outline-none"
                >
                  <Icon className="size-4.5 shrink-0 text-ink-muted" />
                  <span className="flex-1">{label}</span>
                  {badge && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-ink">{badge}</span>}
                  <ChevronRightIcon className="size-4 text-ink-muted" />
                </Link>
              ))}
            </div>
          ))}

          <div className="p-2">
            <button
              ref={itemRef(index++)}
              type="button"
              role="menuitem"
              title={isDemo ? t('account.signOutHint') : undefined}
              onClick={() => {
                close({ restoreFocus: false })
                onSignOut()
              }}
              className="flex w-full items-center justify-center gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <LogOutIcon className="size-4" />
              {isDemo ? t('account.signOutDemo') : t('account.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
