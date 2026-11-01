import { BanIcon, CheckCircleIcon, EyeIcon, TrashIcon } from '../icons'

/**
 * Row menu for a listing in admin tables (Figma): details, approve (unless active), block (unless
 * blocked) and remove (serious violations only; the dialog explains when to block instead).
 * @param {{ onDetails: (listing) => void, open: (action, row) => void }} handlers open = useAdminActions().open
 */
export function listingActionItems(listing, { onDetails, open }) {
  return [
    { label: 'View details', Icon: EyeIcon, onSelect: () => onDetails(listing) },
    ...(listing.moderation !== 'APPROVED' ? [{ label: 'Approve', Icon: CheckCircleIcon, onSelect: () => open('approveListing', listing) }] : []),
    ...(listing.moderation !== 'BLOCKED' ? [{ label: 'Block', Icon: BanIcon, danger: true, onSelect: () => open('blockListing', listing) }] : []),
    { label: 'Remove', Icon: TrashIcon, danger: true, onSelect: () => open('removeListing', listing) },
  ]
}
