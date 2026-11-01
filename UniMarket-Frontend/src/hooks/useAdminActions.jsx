import { useState } from 'react'
import { reportCode } from '../constants/moderation'
import { listingCode } from '../constants/product'
import { adminService } from '../services/admin/adminService'
import AdminActionDialog from '../components/admin/AdminActionDialog'

/** Runs one action per item; the result is "saved" only if every item was saved. */
async function runEach(items, action) {
  if (items.length === 0) throw new Error('Nothing to change: every selected listing already has this status.')
  const results = await Promise.all(items.map(action))
  return { saved: results.every((result) => result.saved) }
}

/** Every admin action: confirmation text, optional reason and the service call. */
const ACTIONS = {
  approveListing: (listing) => ({
    title: 'Approve this listing?',
    message: `“${listing.title}” (${listingCode(listing.id)}) will appear in the marketplace.`,
    confirmLabel: 'Approve listing',
    doneText: 'The listing is now active in the marketplace.',
    run: () => adminService.approveListing(listing.id),
  }),
  blockListing: (listing) => ({
    title: 'Block this listing?',
    message: `“${listing.title}” will be hidden from the marketplace. ${listing.seller?.name ?? 'The seller'} sees your reason and can edit the listing to send it for review again.`,
    confirmLabel: 'Block listing',
    tone: 'danger',
    reason: { label: 'Reason for the seller', placeholder: 'e.g. The photos don’t show the actual item.' },
    doneText: 'The listing is blocked and the seller was told why.',
    run: (reason) => adminService.blockListing(listing.id, reason),
  }),
  removeListing: (listing) => ({
    title: 'Remove this listing permanently?',
    message: `“${listing.title}” will be deleted and can’t be restored. Use this only for prohibited, fake or stolen items; block it instead if the seller can fix it.`,
    confirmLabel: 'Remove listing',
    tone: 'danger',
    reason: { label: 'Reason (sent to the seller)', placeholder: 'e.g. Selling prohibited items is not allowed on UniMarket.' },
    doneText: 'The listing was removed and the seller was told why.',
    run: (reason) => adminService.removeListing(listing.id, reason),
  }),
  // Several listings at once (bulk actions on Admin › Products). Each one is checked separately.
  approveListings: ({ listings }) => ({
    title: `Approve ${listings.length} listings?`,
    message: 'They will appear in the marketplace. Listings that are already active are skipped.',
    confirmLabel: `Approve ${listings.length}`,
    doneText: 'The listings are now active.',
    run: () => runEach(listings.filter((l) => l.moderation !== 'APPROVED'), (l) => adminService.approveListing(l.id)),
  }),
  blockListings: ({ listings }) => ({
    title: `Block ${listings.length} listings?`,
    message: 'They will be hidden from the marketplace. Every seller sees the same reason. Listings that are already blocked are skipped.',
    confirmLabel: `Block ${listings.length}`,
    tone: 'danger',
    reason: { label: 'Reason for the sellers', placeholder: 'e.g. Duplicate listings of the same item.' },
    doneText: 'The listings are blocked.',
    run: (reason) => runEach(listings.filter((l) => l.moderation !== 'BLOCKED'), (l) => adminService.blockListing(l.id, reason)),
  }),
  suspendUser: (user) => ({
    title: `Suspend ${user.name}?`,
    message: 'They won’t be able to sign in, buy or sell, and their listings will be hidden. Open orders must be handled first.',
    confirmLabel: 'Suspend account',
    tone: 'danger',
    reason: { label: 'Reason (sent to the student)', placeholder: 'e.g. Asked buyers to pay outside UniMarket.', hint: 'Refer to the rule that was broken.' },
    doneText: 'The account is suspended.',
    run: (reason) => adminService.suspendUser(user.id, reason),
  }),
  reactivateUser: (user) => ({
    title: `Reactivate ${user.name}?`,
    message: 'They will be able to sign in, buy and sell again.',
    confirmLabel: 'Reactivate account',
    doneText: 'The account is active again.',
    run: () => adminService.reactivateUser(user.id),
  }),
  resolveReport: (report) => ({
    title: `Resolve ${reportCode(report.id)}?`,
    message: 'Take action on the listing or account first (block or suspend), then record what you did.',
    confirmLabel: 'Mark as resolved',
    reason: { label: 'Action taken', placeholder: 'e.g. Listing blocked and seller warned.' },
    doneText: 'The report is resolved.',
    run: (resolution) => adminService.resolveReport(report.id, resolution),
  }),
  dismissReport: (report) => ({
    title: `Dismiss ${reportCode(report.id)}?`,
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
  const [current, setCurrent] = useState(null) // { action, row }
  const config = current && ACTIONS[current.action](current.row)

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
