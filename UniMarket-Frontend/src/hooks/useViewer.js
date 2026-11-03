import { useSyncExternalStore } from 'react'
import { USES_BACKEND_AUTH } from '../config/apiConfig'
import { accountService } from '../services/account/accountService'
import { session } from '../services/auth/session'
import { toViewerProfile } from '../services/auth/viewerProfile'
import { isSampleData } from '../services/products/productService'
import { guestPreview } from '../services/session/guestPreview'
import useAsyncData from './useAsyncData'
import useSession from './useSession'

/**
 * Who the header shows as signed in.
 * - VITE_AUTH_MODE=backend: the real session (GET /api/auth/me). No demo student, no mock fallback.
 *   While a stored session is being checked, `isGuest` is false and `profile` undefined (header shows a placeholder).
 * - demo mode: with sample data the sample student is shown (clearly labelled as a demo account), unless the
 *   demo "guest preview" is on; without sample data everyone is a guest.
 * @returns {{ isGuest: boolean, isDemo: boolean, isBackend: boolean, isAdmin: boolean, profile: object|undefined,
 *   setGuestPreview: (on: boolean) => void, signOut: () => void }}
 */
export default function useViewer() {
  const auth = useSession()
  const isGuestPreview = useSyncExternalStore(guestPreview.subscribe, guestPreview.getSnapshot)
  const showsDemoStudent = !USES_BACKEND_AUTH && isSampleData && !isGuestPreview
  const { data: demoProfile } = useAsyncData(
    () => (showsDemoStudent ? accountService.getMyProfile() : Promise.resolve(null)),
    `viewer-${showsDemoStudent}`,
  )

  if (USES_BACKEND_AUTH) {
    const profile = auth.status === 'authenticated' ? toViewerProfile(auth.user) : undefined
    return {
      isGuest: auth.status === 'anonymous',
      isDemo: false,
      isBackend: true,
      isAdmin: profile?.isAdmin ?? false,
      profile,
      setGuestPreview: () => {},
      signOut: session.signOut,
    }
  }

  return {
    isGuest: !showsDemoStudent,
    isDemo: isSampleData,
    isBackend: false,
    isAdmin: false,
    profile: demoProfile ?? undefined,
    setGuestPreview: guestPreview.set,
    signOut: () => guestPreview.set(true),
  }
}
