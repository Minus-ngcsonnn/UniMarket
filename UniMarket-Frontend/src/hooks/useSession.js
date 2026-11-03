import { useSyncExternalStore } from 'react'
import { session } from '../services/auth/session'

/**
 * Real authentication state (VITE_AUTH_MODE=backend).
 * @returns {{ status: 'restoring'|'authenticated'|'anonymous', user: object|null, reason: string|null }}
 */
export default function useSession() {
  return useSyncExternalStore(session.subscribe, session.getSnapshot)
}
