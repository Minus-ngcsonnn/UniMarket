import { useState } from 'react'
import { reportCode } from '../constants/moderation'
import { listingCode } from '../constants/product'
import { adminService } from '../services/admin/adminService'
import AdminActionDialog from '../components/admin/AdminActionDialog'
import useTranslation from '../i18n/useTranslation'

/** Runs one action per item; the result is "saved" only if every item was saved. */
async function runEach(items, action) {
  if (items.length === 0) throw new Error('Nothing to change: every selected listing already has this status.')
  const results = await Promise.all(items.map(action))
  return { saved: results.every((result) => result.saved) }
}

/** Every admin action: confirmation text, optional reason and the service call. Texts with names use t(). */
const ACTIONS = {
  approveListing: (listing, t) => ({
    title: 'Approve this listing?',
    message: t('“{title}” ({code}) will appear in the marketplace.', { title: listing.title, code: listingCode(listing.id) }),
    confirmLabel: 'Approve listing',
    doneText: 'The listing is now active in the marketplace.',
    run: () => adminService.approveListing(listing.id),
  }),
  blockListing: (listing, t) => ({
    title: 'Block this listing?',
    message: t('“{title}” will be hidden from the marketplace. {seller} sees your reason and can edit the listing to send it for review again.', { title: listing.title, seller: listing.seller?.name ?? t('The seller') }),
    confirmLabel: 'Block listing',
    tone: 'danger',
    reason: { label: 'Reason for the seller', placeholder: 'e.g. The photos don’t show the actual item.' },
    doneText: 'The listing is blocked and the seller was told why.',
    run: (reason) => adminService.blockListing(listing.id, reason),
  }),
  removeListing: (listing, t) => ({
    title: 'Remove this listing permanently?',
    message: t('“{title}” will be deleted and can’t be restored. Use this only for prohibited, fake or stolen items; block it instead if the seller can fix it.', { title: listing.title }),
    confirmLabel: 'Remove listing',
    tone: 'danger',
    reason: { label: 'Reason (sent to the seller)', placeholder: 'e.g. Selling prohibited items is not allowed on UniMarket.' },
    doneText: 'The listing was removed and the seller was told why.',
    run: (reason) => adminService.removeListing(listing.id, reason),
  }),
  // Several listings at once (bulk actions on Admin › Products). Each one is checked separately.
  approveListings: ({ listings }, t) => ({
    title: t('Approve {count} listings?', { count: listings.length }),
    message: 'They will appear in the marketplace. Listings that are already active are skipped.',
    confirmLabel: t('Approve {count}', { count: listings.length }),
    doneText: 'The listings are now active.',
    run: () => runEach(listings.filter((l) => l.moderation !== 'APPROVED'), (l) => adminService.approveListing(l.id)),
  }),
  blockListings: ({ listings }, t) => ({
    title: t('Block {count} listings?', { count: listings.length }),
    message: 'They will be hidden from the marketplace. Every seller sees the same reason. Listings that are already blocked are skipped.',
    confirmLabel: t('Block {count}', { count: listings.length }),
    tone: 'danger',
    reason: { label: 'Reason for the sellers', placeholder: 'e.g. Duplicate listings of the same item.' },
    doneText: 'The listings are blocked.',
    run: (reason) => runEach(listings.filter((l) => l.moderation !== 'BLOCKED'), (l) => adminService.blockListing(l.id, reason)),
  }),
  suspendUser: (user, t) => ({
    title: t('Suspend {name}?', { name: user.name }),
    message: 'They won’t be able to sign in, buy or sell, and their listings will be hidden. Open orders must be handled first.',
    confirmLabel: 'Suspend account',
    tone: 'danger',
    reason: { label: 'Reason (sent to the student)', placeholder: 'e.g. Asked buyers to pay outside UniMarket.', hint: 'Refer to the rule that was broken.' },
    doneText: 'The account is suspended.',
    run: (reason) => adminService.suspendUser(user.id, reason),
  }),
  reactivateUser: (user, t) => ({
    title: t('Reactivate {name}?', { name: user.name }),
    message: 'They will be able to sign in, buy and sell again.',
    confirmLabel: 'Reactivate account',
    doneText: 'The account is active again.',
    run: () => adminService.reactivateUser(user.id),
  }),
  resolveReport: (report, t) => ({
    title: t('Resolve {code}?', { code: reportCode(report.id) }),
    message: 'Take action on the listing or account first (block or suspend), then record what you did.',
    confirmLabel: 'Mark as resolved',
    reason: { label: 'Action taken', placeholder: 'e.g. Listing blocked and seller warned.' },
    doneText: 'The report is resolved.',
    run: (resolution) => adminService.resolveReport(report.id, resolution),
  }),
  dismissReport: (report, t) => ({
    title: t('Dismiss {code}?', { code: reportCode(report.id) }),
    message: 'Use this when no rule was broken. The report is closed without action.',
    confirmLabel: 'Dismiss report',
    tone: 'danger',
    reason: { label: 'Why no action is needed', placeholder: 'e.g. Item is allowed on campus.' },
    doneText: 'The report is dismissed.',
    run: (resolution) => adminService.dismissReport(report.id, resolution),
  }),
}

/**
 * Opens confirmation dialogs for admin actions. Render `dialog` once in the page.
 * @returns {{ open: (action: keyof ACTIONS, row: object) => void, dialog: React.ReactNode }}
 */
export default function useAdminActions() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(null) // { action, row }
  const config = current && ACTIONS[current.action](current.row, t)

  return {
    open: (action, row) => setCurrent({ action, row }),
    dialog: config && (
      <AdminActionDialog
        key={`${current.action}-${current.row.id}`}
        title={config.title}
        message={config.message}
        confirmLabel={config.confirmLabel}
        tone={config.tone}
        reason={config.reason}
        doneText={config.doneText}
        onConfirm={config.run}
        onClose={() => setCurrent(null)}
      />
    ),
  }
}
