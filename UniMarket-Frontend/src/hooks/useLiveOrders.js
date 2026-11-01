import { useEffect, useEffectEvent } from 'react'
import { ORDER_POLL_INTERVAL_MS } from '../constants/order'
import { onOrdersChanged } from '../services/orders/orderService'
import useAsyncData from './useAsyncData'
import usePolling from './usePolling'

/**
 * Order data that stays up to date (Q4): refreshed every 30 s while the tab is visible, and right
 * after any order action in this tab. Refreshes happen in the background (no loading flash).
 * Same arguments and return value as useAsyncData.
 */
export default function useLiveOrders(load, key) {
  const query = useAsyncData(load, key)
  const refresh = useEffectEvent(() => query.reload())

  usePolling(query.reload, ORDER_POLL_INTERVAL_MS) // usePolling keeps the latest callback itself
  useEffect(() => onOrdersChanged(() => refresh()), [])

  return query
}
