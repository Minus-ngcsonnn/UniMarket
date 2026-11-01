import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CAMPUSES, CAMPUS_KEYS, UNIVERSITY_NAME } from '../../constants/product'
import { PATHS } from '../../routes/paths'
import { BellIcon, FlagIcon, MenuIcon, SearchIcon, TagIcon } from '../icons'
import ActionMenu from '../ui/ActionMenu'
import Avatar from '../ui/Avatar'
import Select from '../ui/Select'

const CAMPUS_OPTIONS = [{ value: '', label: 'All campuses' }, ...CAMPUS_KEYS.map((key) => ({ value: key, label: `${UNIVERSITY_NAME} ${CAMPUSES[key].label}` }))]

/** Sections that have a searchable list; search from the overview goes to Products. */
const SEARCHABLE = [PATHS.adminUsers, PATHS.adminProducts, PATHS.adminOrders, PATHS.adminReports]

/**
 * Admin top bar (Figma): search (⌘K / Ctrl K), campus filter, notifications and the admin account.
 * @param {{ name, title }} [admin] signed-in admin (sample admin in development)
 * @param {() => void} onOpenMenu opens the sidebar drawer on small screens
 */
export default function AdminTopbar({ campus, onCampusChange, counts = {}, admin, onOpenMenu }) {
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const section = SEARCHABLE.find((path) => location.pathname.startsWith(path)) ?? PATHS.adminProducts

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function submit(event) {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `${section}?q=${encodeURIComponent(q)}` : section)
    setQuery('')
  }

  const notifications = [
    ...(counts.pendingListings > 0 ? [{ label: `${counts.pendingListings} listing${counts.pendingListings > 1 ? 's' : ''} awaiting review`, Icon: TagIcon, to: `${PATHS.adminProducts}?moderation=PENDING` }] : []),
    ...(counts.openReports > 0 ? [{ label: `${counts.openReports} open violation report${counts.openReports > 1 ? 's' : ''}`, Icon: FlagIcon, to: `${PATHS.adminReports}?status=OPEN` }] : []),
  ]
  const notificationCount = (counts.pendingListings ?? 0) + (counts.openReports ?? 0)

  return (
    <div className="flex h-16 items-center gap-2 border-b border-line bg-surface px-4 sm:gap-3 sm:px-6">
      <button type="button" onClick={onOpenMenu} aria-label="Open admin menu" className="flex size-10 items-center justify-center rounded-control text-ink hover:bg-subtle lg:hidden">
        <MenuIcon className="size-5" />
      </button>

      <form role="search" onSubmit={submit} className="relative min-w-0 flex-1 md:max-w-md">
        <label htmlFor="admin-search" className="sr-only">
          Search {section.replace('/admin/', '')}
        </label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          ref={inputRef}
          id="admin-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${section.replace('/admin/', '')}…`}
          className="h-10 w-full rounded-control border border-line bg-canvas pr-14 pl-9 text-sm text-ink placeholder:text-ink-muted/80 focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 text-[11px] text-ink-muted sm:block">⌘K</kbd>
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Select
          label="Campus"
          hideLabel
          name="campus"
          options={CAMPUS_OPTIONS}
          value={campus}
          onChange={onCampusChange}
          className="hidden w-48 md:block"
        />
        <div className="relative">
          <ActionMenu
            label={notificationCount > 0 ? `Notifications, ${notificationCount} need attention` : 'Notifications'}
            heading="Needs attention"
            icon={BellIcon}
            triggerClassName="size-10 rounded-full"
            items={notifications.length ? notifications : [{ label: 'You’re all caught up', Icon: BellIcon, to: PATHS.admin }]}
          />
          {notificationCount > 0 && <span className="pointer-events-none absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />}
        </div>
        <div className="flex items-center gap-2 border-l border-line pl-2 sm:pl-3">
          <Avatar name={admin?.name ?? 'Admin'} size="sm" />
          <div className="hidden leading-tight xl:block">
            <p className="text-sm font-semibold text-ink">{admin?.name ?? 'Admin'}</p>
            <p className="text-xs text-ink-muted">{admin?.title ?? 'Not signed in'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
