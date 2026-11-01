import { BanIcon, CheckCircleIcon, EyeIcon } from '../icons'

/**
 * Row menu for a listing in admin tables: details, approve (unless active), block (unless blocked).
 * @param {{ onDetails: (listing) => void, open: (action, row) => void }} handlers open = useAdminActions().open
 */
export function listingActionItems(listing, { onDetails, open }) {
  return [
    { label: 'View details', Icon: EyeIcon, onSelect: () => onDetails(listing) },
    ...(listing.moderation !== 'APPROVED' ? [{ label: 'Approve', Icon: CheckCircleIcon, onSelect: () => open('approveListing', listing) }] : []),
    ...(listing.moderation !== 'BLOCKED' ? [{ label: 'Block', Icon: BanIcon, danger: true, onSelect: () => open('blockListing', listing) }] : []),
  ]
}
