import { useSyncExternalStore } from 'react'
import { accountService } from '../services/account/accountService'
import { isSampleData } from '../services/products/productService'
import { guestPreview } from '../services/session/guestPreview'
import useAsyncData from './useAsyncData'

/**
 * Who the header shows as signed in.
 * - Real authentication isn't connected, so without sample data everyone is a guest.
 * - With sample data the sample student is shown (clearly labelled as a demo account), unless the
 *   demo "guest preview" is on.
 * @returns {{ isGuest: boolean, isDemo: boolean, profile: object|undefined, setGuestPreview: (on: boolean) => void }}
 */
export default function useViewer() {
  const isGuestPreview = useSyncExternalStore(guestPreview.subscribe, guestPreview.getSnapshot)
  const showsDemoStudent = isSampleData && !isGuestPreview
  const { data: profile } = useAsyncData(
    () => (showsDemoStudent ? accountService.getMyProfile() : Promise.resolve(null)),
    `viewer-${showsDemoStudent}`,
  )
  return {
    isGuest: !showsDemoStudent,
    isDemo: isSampleData,
    profile: profile ?? undefined,
    setGuestPreview: guestPreview.set,
  }
}
