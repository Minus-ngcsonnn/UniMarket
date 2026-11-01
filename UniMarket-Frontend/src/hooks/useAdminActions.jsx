import { useState } from 'react'
import { reportCode } from '../constants/moderation'
import { listingCode } from '../constants/product'
import { adminService } from '../services/admin/adminService'
import AdminActionDialog from '../components/admin/AdminActionDialog'

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
