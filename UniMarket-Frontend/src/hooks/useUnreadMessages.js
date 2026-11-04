import { useCallback, useEffect, useState } from 'react'
import { USES_BACKEND_AUTH } from '../config/apiConfig'
import { chatApi, onChatChanged } from '../services/chat/chatApi'
import usePolling from './usePolling'
import useSession from './useSession'

const POLL_MS = 15000

/**
 * Unread chat messages of the signed-in student (header badge). Real backend only; 0 for guests, admins and demo mode.
 * Refreshes every 15 s while the tab is visible and right after a message is sent or read on this page.
 */
export default function useUnreadMessages() {
  const auth = useSession()
  const enabled = USES_BACKEND_AUTH && auth.status === 'authenticated' && auth.user?.role !== 'ADMIN'
  const [count, setCount] = useState(0)

  const refresh = useCallback(() => {
    if (enabled) chatApi.unreadCount().then(setCount, () => {})
  }, [enabled])

  useEffect(() => {
    refresh()
    return onChatChanged(refresh)
  }, [refresh])
  usePolling(refresh, POLL_MS, enabled)

  return enabled ? count : 0
}
