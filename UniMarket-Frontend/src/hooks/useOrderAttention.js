import { orderService } from '../services/orders/orderService'
import useLiveOrders from './useLiveOrders'

/**
 * How many orders are waiting for the signed-in student (Q4: polled every 30 s and refreshed after
 * order actions). Returns { buyer, seller, total }; zeros when unknown (e.g. order API not connected).
 */
export default function useOrderAttention() {
  const { data } = useLiveOrders(() => orderService.getActionCounts(), 'order-attention')
  const buyer = data?.buyer ?? 0
  const seller = data?.seller ?? 0
  return { buyer, seller, total: buyer + seller }
}
